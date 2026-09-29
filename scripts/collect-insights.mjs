// Ring 0 measure step (Decision D3): turns GitHub findings into draft
// Insights in concept/insights/. Runs as `node scripts/collect-insights.mjs
// [--dry-run] [--since <date>]`. Sources: failed `verify` and other
// required-check runs on PRs, PR comments with "interface-review: Block",
// PR reviews requesting changes, and .temp/overrides.jsonl.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConcept } from './check-concept.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FAIL_LINE = /FAIL .+/

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function toInsights(findings, existing) {
  const usedSources = new Set(existing.map((insight) => insight.source))
  let nextNumber =
    existing.reduce(
      (max, insight) => Math.max(max, Number(insight.id.slice(1))),
      0,
    ) + 1
  const insights = []
  for (const finding of findings) {
    if (usedSources.has(finding.source)) continue
    const id = `I${nextNumber}`
    insights.push({
      id,
      file: `${id}-${slugify(finding.title)}.md`,
      frontmatter: {
        id,
        title: finding.title,
        date: finding.date,
        source: finding.source,
        status: 'draft',
      },
      body: finding.body,
    })
    usedSources.add(finding.source)
    nextNumber += 1
  }
  return insights
}

export function renderInsight(insight) {
  const frontmatter = Object.entries(insight.frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  return `---\n${frontmatter}\n---\n${insight.body}\n`
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
}

function ghJson(args) {
  return JSON.parse(gh(args))
}

function jobUrl(repo, runId, jobId) {
  return `https://github.com/${repo}/actions/runs/${runId}/job/${jobId}`
}

function failingRuleLine(jobId) {
  let log
  try {
    log = gh(['run', 'view', '--job', String(jobId), '--log-failed'])
  } catch {
    return null
  }
  for (const rawLine of log.split('\n')) {
    const match = rawLine.split('\t').pop().match(FAIL_LINE)
    if (match) return match[0].trim()
  }
  return null
}

function checkFindings(repo, pr, since) {
  const findings = []
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
  ]).filter((run) => run.conclusion === 'failure' && run.createdAt >= since)
  for (const run of runs) {
    const { jobs } = ghJson([
      'run',
      'view',
      String(run.databaseId),
      '--json',
      'jobs',
    ])
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

function commentFindings(pr, since) {
  const comments = ghJson([
    'api',
    `repos/{owner}/{repo}/issues/${pr.number}/comments`,
  ]).filter(
    (comment) =>
      comment.created_at >= since &&
      comment.body.includes('interface-review: Block'),
  )
  return comments.map((comment) => ({
    source: comment.html_url,
    title: `PR #${pr.number} interface review blocked`,
    date: comment.created_at.slice(0, 10),
    body: `Interface review blocked ${pr.url}.\n\n${comment.body}`,
  }))
}

function reviewFindings(pr, since) {
  const reviews = ghJson([
    'api',
    `repos/{owner}/{repo}/pulls/${pr.number}/reviews`,
  ]).filter(
    (review) =>
      review.submitted_at >= since && review.state === 'CHANGES_REQUESTED',
  )
  return reviews.map((review) => ({
    source: review.html_url,
    title: `PR #${pr.number} review requested changes`,
    date: review.submitted_at.slice(0, 10),
    body: `Review requested changes on ${pr.url}.\n\n${review.body}`,
  }))
}

function overrideFindings(since) {
  const path = join(ROOT, '.temp', 'overrides.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.at >= since)
    .map((entry) => ({
      source: `overrides.jsonl#${entry.at}`,
      title: `Workflow guard overridden: ${entry.reason}`,
      date: entry.at.slice(0, 10),
      body: `\`${entry.command}\` overrode "${entry.problem}".\n\nReason: ${entry.reason}`,
    }))
}

export function fetchFindings(since) {
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
  ])
  const findings = []
  for (const pr of prs) {
    findings.push(...checkFindings(repo, pr, since))
    findings.push(...commentFindings(pr, since))
    findings.push(...reviewFindings(pr, since))
  }
  findings.push(...overrideFindings(since))
  return findings
}

function defaultSince(existingInsights) {
  const dates = existingInsights
    .map((insight) => insight.data.date)
    .filter(Boolean)
  return dates.length > 0 ? dates.sort().at(-1) : '1970-01-01'
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run')
  const sinceIndex = argv.indexOf('--since')
  const since = sinceIndex === -1 ? null : argv[sinceIndex + 1]
  return { dryRun, since }
}

function main() {
  const { dryRun, since } = parseArgs(process.argv.slice(2))
  const existingInsights = loadConcept(join(ROOT, 'concept')).filter(
    (record) => record.folder === 'insights' && record.data,
  )
  const findings = fetchFindings(since ?? defaultSince(existingInsights))
  const insights = toInsights(
    findings,
    existingInsights.map((record) => ({
      id: record.data.id,
      source: record.data.source,
    })),
  )
  if (insights.length === 0) {
    console.log('No new findings.')
    return
  }
  for (const insight of insights) {
    if (dryRun) {
      console.log(`would write concept/insights/${insight.file}`)
      console.log(`  title: ${insight.frontmatter.title}`)
      console.log(`  source: ${insight.frontmatter.source}`)
      continue
    }
    mkdirSync(join(ROOT, 'concept', 'insights'), { recursive: true })
    writeFileSync(
      join(ROOT, 'concept', 'insights', insight.file),
      renderInsight(insight),
    )
    console.log(`wrote concept/insights/${insight.file}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
