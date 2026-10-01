// CI entrypoint for the PR gate (scripts/check-pr-workflow.mjs holds the
// pure `problems` check). Needs `tsx` to run: it reads Decisions through
// the Drizzle schema in src/db/, which is TypeScript.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { createDb } from '../src/db/client.ts'
import { isBotBranch, problems } from './check-pr-workflow.mjs'
import { loadDecisions } from './load-decisions.ts'

async function main() {
  if (
    process.env.GITHUB_EVENT_NAME !== 'pull_request' ||
    !process.env.GITHUB_EVENT_PATH
  )
    return
  const { pull_request: pr } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'),
  )
  if (isBotBranch(pr.head.ref)) return

  const databaseUrl = process.env.CONCEPT_DATABASE_URL
  if (!databaseUrl) {
    throw new Error('CONCEPT_DATABASE_URL is required in CI.')
  }

  const files = execFileSync(
    'git',
    ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
  const decisions = await loadDecisions(createDb(databaseUrl), 'glue')
  const found = problems({ body: pr.body ?? '', files, decisions })
  if (found.length === 0) return
  console.error(
    [
      'PR workflow check failed. Fix the PR body or the change:',
      ...found.map((line) => `  - ${line}`),
    ].join('\n'),
  )
  process.exit(1)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
