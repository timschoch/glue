// PR gate for the run rules in CLAUDE.md. Runs as a `ci` step in
// .skilly/verify.json, via check-pr-workflow.ts: it loads Decisions over
// Glue's HTTP API and calls `problems` below. Checks the PR body and the
// changed files:
//   - an issue link: "Closes #12", "Fixes #12" or "Refs #12"
//   - the rule of the gate, shared with the gate of each Project
//     (src/github/pr-gate.mjs): a "Decision:" line naming the Decision the
//     change implements, or a "Contract: <concept>@<version>" line naming
//     the Contract Version the change was built with. It must be the newest
//     Version (D28).
//   - source changes come with test changes, or a "No-test-reason:" line
// Outside a pull_request build it passes.
import { findContractLine } from '../src/github/pr-body.mjs'
import { listGateReasons } from '../src/github/pr-gate.mjs'

export { findContractLine }

const SOURCE = /^src\/.*\.(ts|tsx)$/
const GENERATED = /(^|\/)routeTree\.gen\.ts$/
const TEST = /\.(test|spec)\.(ts|tsx|mjs|js)$|^e2e\//
// Branches that bots open. Their PRs carry no issue link and no Decision.
const BOT_PREFIXES = ['dependabot/', 'renovate/', 'release-please--', 'skilly/']
// The branch that skilly's update workflow opens its PR from.
const SKILLY_UPDATE_BRANCH = 'chore/skilly-update'

export function isBotBranch(ref) {
  return (
    ref === SKILLY_UPDATE_BRANCH ||
    BOT_PREFIXES.some((prefix) => ref.startsWith(prefix))
  )
}
export function problems({ body, files, decisions, contract, projects }) {
  const found = []
  if (!/\b(Closes|Fixes|Resolves|Refs) #\d+/i.test(body)) {
    found.push(
      'Link the issue: "Closes #<n>" (or "Refs #<n>" when the issue stays open).',
    )
  }
  found.push(...listGateReasons({ body, decisions, contract, projects }))
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
