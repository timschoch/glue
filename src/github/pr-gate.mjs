// The rule of the gate (glue/D48): why the body of a pull request breaks the
// Contract of its Concept. Plain JavaScript, as pr-body.mjs: the gate of a
// Project in src/db/gate.ts and the PR gate of this repository in
// scripts/check-pr-workflow.mjs share it.
import { findContractLine, findDecisionIds } from './pr-body.mjs'

// `contract` is the newest Version of the Concept that the body names.
function listContractReasons(named, contract) {
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

function listDecisionReasons(ids, decisions, projects) {
  if (ids.length === 0) {
    return [
      'Name at least one Decision id in the "Decision:" line, for example "Decision: D2".',
    ]
  }
  return ids.flatMap((id) => {
    if (projects && !id.includes('/')) {
      const lines = projects.map((project) => `"Decision: ${project}/${id}"`)
      return [
        `Decision "${id}" names no Project. The repository has the Projects ${projects.map((project) => `"${project}"`).join(' and ')}: write ${lines.join(' or ')}.`,
      ]
    }
    const decision = decisions.get(id)
    if (!decision) {
      return [
        `Decision "${id}" does not exist. List them with \`pnpm concept list decisions\`.`,
      ]
    }
    if (decision.status !== 'superseded') return []
    // The owner can sink a Decision: it is superseded with no successor.
    return [
      decision.superseded_by
        ? `Decision "${id}" is superseded by "${decision.superseded_by}". Cite that Decision instead.`
        : `Decision "${id}" is sunk and has no successor. Cite an accepted Decision instead.`,
    ]
  })
}

// The reasons that the build breaks. None: it holds. `decisions` has each
// Decision that the body can name, by the id as the body writes it.
// `projects` has the Projects of a repository that two or more Projects
// share: there, a bare id names no Decision (glue/D50).
export function listGateReasons({ body, decisions, contract, projects }) {
  const named = findContractLine(body)
  const ids = findDecisionIds(body)
  const reasons =
    named === undefined ? [] : listContractReasons(named, contract)
  if (ids) return [...reasons, ...listDecisionReasons(ids, decisions, projects)]
  if (named !== undefined) return reasons
  return [
    'Name the Decision this change implements: "Decision: <id>", for example "Decision: D2". Or name the Contract Version it was built with: "Contract: <concept>@<version>".',
  ]
}
