// PR gate for the run rules in CLAUDE.md. Runs as a `ci` step in
// .skilly/verify.json, via check-pr-workflow.ts: it loads Decisions over
// Glue's HTTP API and calls `problems` below. Checks the PR body and the
// changed files:
//   - an issue link: "Closes #12", "Fixes #12" or "Refs #12"
//   - a "Decision:" line naming the Decision the change implements
//   - source changes come with test changes, or a "No-test-reason:" line
// Outside a pull_request build it passes.
const SOURCE = /^src\/.*\.(ts|tsx)$/
const GENERATED = /(^|\/)routeTree\.gen\.ts$/
const TEST = /\.(test|spec)\.(ts|tsx|mjs|js)$|^e2e\//
const DECISION_LINE = /^Decision:\s*(.+)$/im
const DECISION_ID = /\bD\d+\b/g
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
            `Decision "${id}" does not exist. List them with \`pnpm concept list decisions\`.`,
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
