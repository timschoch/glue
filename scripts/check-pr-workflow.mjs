// PR gate for the run rules in CLAUDE.md. Runs as a `ci` step in
// .skilly/verify.json, via check-pr-workflow.ts: it loads Decisions over
// Glue's HTTP API and calls `problems` below. Checks the PR body and the
// changed files:
//   - an issue link: "Closes #12", "Fixes #12" or "Refs #12"
//   - a "Decision:" line naming the Decision the change implements, or a
//     "Contract: <concept>@<version>" line naming the Contract Version the
//     change was built with. It must be the newest Version (D28).
//   - source changes come with test changes, or a "No-test-reason:" line
// Outside a pull_request build it passes.
import { findContractLine, findDecisionIds } from '../src/github/pr-body.mjs'

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

// `contract` is the newest Version of the Concept that the body names.
function contractProblems(named, contract) {
  if (named === null) {
    return [
      'Name the Contract Version: "Contract: <concept>@<version>", for example "Contract: part-model@3".',
    ]
  }
  const newest =
    contract?.concept === named.concept ? contract.newestVersion : undefined
  if (newest === undefined) {
    return [
      `Concept "${named.concept}" has no Contract Version. Sign it off with \`pnpm concept contract sign ${named.concept} --owner <name>\`.`,
    ]
  }
  if (named.version !== newest) {
    return [
      `Contract "${named.concept}@${named.version}" is not the newest Version. Build with "${named.concept}@${newest}": \`pnpm concept contract show ${named.concept}\`.`,
    ]
  }
  return []
}

export function problems({ body, files, decisions, contract }) {
  const found = []
  if (!/\b(Closes|Fixes|Resolves|Refs) #\d+/i.test(body)) {
    found.push(
      'Link the issue: "Closes #<n>" (or "Refs #<n>" when the issue stays open).',
    )
  }
  const named = findContractLine(body)
  const ids = findDecisionIds(body)
  if (named !== undefined) found.push(...contractProblems(named, contract))
  if (!ids) {
    if (named === undefined) {
      found.push(
        'Name the Decision this change implements: "Decision: <id>", for example "Decision: D2". Or name the Contract Version it was built with: "Contract: <concept>@<version>".',
      )
    }
  } else {
    if (ids.length === 0) {
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
          // The owner can sink a Decision: it is superseded with no successor.
          found.push(
            decision.superseded_by
              ? `Decision "${id}" is superseded by "${decision.superseded_by}". Cite that Decision instead.`
              : `Decision "${id}" is sunk and has no successor. Cite an accepted Decision instead.`,
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
