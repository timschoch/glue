// CI entrypoint for the PR gate (scripts/check-pr-workflow.mjs holds the
// pure `problems` check). Reads Decisions, and the Contract Version that the
// PR names, over Glue's HTTP API: GLUE_API_TOKEN
// (a read token), GLUE_API_URL (default: the main deployment).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  findContractLine,
  isBotBranch,
  problems,
} from './check-pr-workflow.mjs'
import { loadNewestContract } from './load-contract.ts'
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

  const files = execFileSync(
    'git',
    ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
  const body: string = pr.body ?? ''
  const { decisions, projects } = await loadDecisions()
  const named = findContractLine(body)
  const contract = named ? await loadNewestContract(named.concept) : undefined
  const found = problems({ body, files, decisions, contract, projects })
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
