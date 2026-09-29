// PR gate for the run rules in CLAUDE.md. Runs as a `ci` step in
// .skilly/verify.json. Checks the PR body and the changed files:
//   - an issue link: "Closes #12", "Fixes #12" or "Refs #12"
//   - a "Decision:" line naming the Decision the change implements
//   - source changes come with test changes, or a "No-test-reason:" line
// Outside a pull_request build it passes.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConcept } from './check-concept.mjs'

const BOT_PREFIXES = ['dependabot/', 'renovate/', 'release-please--', 'skilly/']
const SOURCE = /^src\/.*\.(ts|tsx)$/
const GENERATED = /(^|\/)routeTree\.gen\.ts$/
const TEST = /\.(test|spec)\.(ts|tsx|mjs|js)$|^e2e\//
const DECISION_LINE = /^Decision:\s*(.+)$/im
const DECISION_ID = /\bD\d+\b/g

export function problems({ body, files, decisions }) {
  const found = []
  if (!/\b(Closes|Fixes|Resolves|Refs) #\d+/i.test(body)) {
    found.push(
      'Link the issue: "Closes #<n>" (or "Refs #<n>" when the issue stays open).',
    )
  }
  const decisionLine = body.match(DECISION_LINE)
  if (!decisionLine) {
    found.push(
      'Name the Decision this change implements: "Decision: <id>", for example "Decision: D2".',
    )
  } else {
    const ids = decisionLine[1].match(DECISION_ID)
    if (!ids) {
      found.push(
        'Name at least one Decision id in the "Decision:" line, for example "Decision: D2".',
      )
    } else {
      for (const id of ids) {
        const decision = decisions.get(id)
        if (!decision) {
          found.push(
            `Decision "${id}" does not exist. Decisions live in concept/decisions/.`,
          )
        } else if (decision.status === 'superseded') {
          found.push(
            `Decision "${id}" is superseded by "${decision.superseded_by}". Cite that Decision instead.`,
          )
        }
      }
    }
  }
  const source = files.filter(
    (file) => SOURCE.test(file) && !GENERATED.test(file) && !TEST.test(file),
  )
  const tests = files.filter((file) => TEST.test(file))
  if (
    source.length > 0 &&
    tests.length === 0 &&
    !/^No-test-reason:\s*\S+/im.test(body)
  ) {
    found.push(
      `Source changed without a test change (${source.join(', ')}). Write the test first (tdd), or add "No-test-reason: <why>".`,
    )
  }
  return found
}

function main() {
  if (
    process.env.GITHUB_EVENT_NAME !== 'pull_request' ||
    !process.env.GITHUB_EVENT_PATH
  )
    return
  const { pull_request: pr } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'),
  )
  if (BOT_PREFIXES.some((prefix) => pr.head.ref.startsWith(prefix))) return
  const files = execFileSync(
    'git',
    ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter(Boolean)
  const decisions = new Map(
    loadConcept(join(process.cwd(), 'concept'))
      .filter((record) => record.folder === 'decisions' && record.data?.id)
      .map((record) => [record.data.id, record.data]),
  )
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

if (import.meta.url === `file://${process.argv[1]}`) main()
