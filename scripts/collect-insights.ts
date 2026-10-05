// Ring 1 measure step (Decision D3, D5): turns GitHub findings into draft
// Insights in the database, in the build Project. Run:
// tsx --env-file=.env.local scripts/collect-insights.ts [--dry-run] [--since <date>]
// Sources: failed `verify` and other required-check runs on PRs, PR comments
// with "interface-review: Block", PR reviews requesting changes, and
// .temp/overrides.jsonl.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDb } from '../src/db/client.ts'
import type { ConceptDb } from '../src/db/client.ts'
import { listInsightSources } from '../src/db/measure-reads.ts'
import { addPart, addProject } from '../src/db/part-records.ts'
import { findBuildProject } from '../src/db/projects.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FAIL_LINE = /FAIL .+/
const FAILED_STEP_LINE = /FAILED .+/

export type Finding = {
  source: string
  title: string
  date: string
  body: string
}

export type ExistingInsight = {
  id: string
  source: string
}

export type DraftInsight = {
  title: string
  date: string
  source: string
  status: 'draft'
  body: string
}

export function toInsights(
  findings: Finding[],
  existing: ExistingInsight[],
): DraftInsight[] {
  const usedSources = new Set(existing.map((insight) => insight.source))
  const insights: DraftInsight[] = []
  for (const finding of findings) {
    if (usedSources.has(finding.source)) continue
    insights.push({
      title: finding.title,
      date: finding.date,
      source: finding.source,
      status: 'draft',
      body: finding.body,
    })
    usedSources.add(finding.source)
  }
  return insights
}

export function loadExistingInsights(
  db: ConceptDb,
  productSlug: string,
): Promise<(ExistingInsight & { date: string })[]> {
  return listInsightSources(db, productSlug)
}

export async function addInsights(
  db: ConceptDb,
  productSlug: string,
  drafts: DraftInsight[],
): Promise<string[]> {
  const ids: string[] = []
  for (const draft of drafts) {
    await addProject(db, productSlug)
    ids.push(await addPart(db, productSlug, { type: 'insight', ...draft }))
  }
  return ids
}

function gh(args: string[]) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
}

function ghJson(args: string[]) {
  return JSON.parse(gh(args))
}

function jobUrl(repo: string, runId: number, jobId: number) {
  return `https://github.com/${repo}/actions/runs/${runId}/job/${jobId}`
}

export function extractFailLine(log: string): string | null {
  const lines = log
    .split('\n')
    .map((rawLine) => rawLine.split('\t').pop() ?? '')
  const ruleLine = lines.map((line) => line.match(FAIL_LINE)?.[0]).find(Boolean)
  if (ruleLine) return ruleLine.trim()
  const stepLine = lines
    .map((line) => line.match(FAILED_STEP_LINE)?.[0])
    .find(Boolean)
  return stepLine ? stepLine.trim() : null
}

function failingRuleLine(jobId: number) {
  let log: string
  try {
    log = gh(['run', 'view', '--job', String(jobId), '--log-failed'])
  } catch {
    return null
  }
  return extractFailLine(log)
}

function runFindings(repo: string, pr: PullRequest, since: string) {
  const findings: Finding[] = []
  const runs = ghJson([
    'run',
    'list',
    '--branch',
    pr.headRefName,
    '--event',
    'pull_request',
    '--json',
    'databaseId,name,conclusion,createdAt',
    '--limit',
    '50',
  ]).filter(
    (run: WorkflowRun) =>
      run.conclusion === 'failure' && run.createdAt >= since,
  )
  for (const run of runs as WorkflowRun[]) {
    const { jobs } = ghJson([
      'run',
      'view',
      String(run.databaseId),
      '--json',
      'jobs',
    ]) as { jobs: WorkflowJob[] }
    for (const job of jobs.filter(
      (candidate) => candidate.conclusion === 'failure',
    )) {
      const url = jobUrl(repo, run.databaseId, job.databaseId)
      const rule = failingRuleLine(job.databaseId)
      const title =
        job.name === 'verify'
          ? `PR #${pr.number} verify check failed`
          : `PR #${pr.number} ${job.name} check failed`
      findings.push({
        source: url,
        title,
        date: run.createdAt.slice(0, 10),
        body: rule
          ? `${job.name} failed on ${pr.url}.\n\n${rule}`
          : `${job.name} failed on ${pr.url}.`,
      })
    }
  }
  return findings
}

function commentFindings(pr: PullRequest, since: string): Finding[] {
  const comments = ghJson([
    'api',
    `repos/{owner}/{repo}/issues/${pr.number}/comments`,
  ]).filter(
    (comment: IssueComment) =>
      comment.created_at >= since &&
      comment.body.includes('interface-review: Block'),
  )
  return (comments as IssueComment[]).map((comment) => ({
    source: comment.html_url,
    title: `PR #${pr.number} interface review blocked`,
    date: comment.created_at.slice(0, 10),
    body: `Interface review blocked ${pr.url}.\n\n${comment.body}`,
  }))
}

function reviewFindings(pr: PullRequest, since: string): Finding[] {
  const reviews = ghJson([
    'api',
    `repos/{owner}/{repo}/pulls/${pr.number}/reviews`,
  ]).filter(
    (review: PullRequestReview) =>
      review.submitted_at >= since && review.state === 'CHANGES_REQUESTED',
  )
  return (reviews as PullRequestReview[]).map((review) => ({
    source: review.html_url,
    title: `PR #${pr.number} review requested changes`,
    date: review.submitted_at.slice(0, 10),
    body: `Review requested changes on ${pr.url}.\n\n${review.body}`,
  }))
}

function overrideFindings(since: string): Finding[] {
  const path = join(ROOT, '.temp', 'overrides.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OverrideEntry)
    .filter((entry) => entry.at >= since)
    .map((entry) => ({
      source: `overrides.jsonl#${entry.at}`,
      title: `Workflow guard overridden: ${entry.reason}`,
      date: entry.at.slice(0, 10),
      body: `\`${entry.command}\` overrode "${entry.problem}".\n\nReason: ${entry.reason}`,
    }))
}

type PullRequest = { number: number; headRefName: string; url: string }
type WorkflowRun = {
  databaseId: number
  name: string
  conclusion: string
  createdAt: string
}
type WorkflowJob = { databaseId: number; name: string; conclusion: string }
type IssueComment = { html_url: string; created_at: string; body: string }
type PullRequestReview = {
  html_url: string
  submitted_at: string
  state: string
  body: string
}
type OverrideEntry = {
  at: string
  reason: string
  command: string
  problem: string
}

export function fetchFindings(since: string): Finding[] {
  const repo = gh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '-q',
    '.nameWithOwner',
  ]).trim()
  const prs = ghJson([
    'pr',
    'list',
    '--state',
    'all',
    '--json',
    'number,headRefName,url',
  ]) as PullRequest[]
  const findings: Finding[] = []
  for (const pr of prs) {
    findings.push(...runFindings(repo, pr, since))
    findings.push(...commentFindings(pr, since))
    findings.push(...reviewFindings(pr, since))
  }
  findings.push(...overrideFindings(since))
  return findings
}

function defaultSince(
  existingInsights: (ExistingInsight & { date: string })[],
) {
  const dates = existingInsights.map((insight) => insight.date).filter(Boolean)
  return dates.length > 0 ? dates.sort().at(-1)! : '1970-01-01'
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run')
  const sinceIndex = argv.indexOf('--since')
  const since = sinceIndex === -1 ? null : argv[sinceIndex + 1]
  return { dryRun, since }
}

async function main() {
  const { dryRun, since } = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  const db = createDb(databaseUrl)
  const project = await findBuildProject(db)
  const existingInsights = await loadExistingInsights(db, project)
  const findings = fetchFindings(since ?? defaultSince(existingInsights))
  const drafts = toInsights(findings, existingInsights)
  if (drafts.length === 0) {
    console.log('No new findings.')
    return
  }
  if (dryRun) {
    for (const draft of drafts) {
      console.log('would insert an Insight')
      console.log(`  title: ${draft.title}`)
      console.log(`  source: ${draft.source}`)
    }
    return
  }
  for (const id of await addInsights(db, project, drafts)) {
    console.log(`inserted Insight ${id}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
