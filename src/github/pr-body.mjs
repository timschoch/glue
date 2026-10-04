// What the body of a pull request names: the Decisions that the change
// implements, and the Contract Version that it was built with (D28). Plain
// JavaScript: the PR gate in scripts/check-pr-workflow.mjs runs it with node,
// and the builds of a Project read it in src/db/builds.ts.
const DECISION_LINE = /^Decision:\s*(.+)$/im
const DECISION_ID = /\bD\d+\b/g
const CONTRACT_LINE = /^Contract:\s*(.*)$/im
const CONTRACT_VERSION = /^([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/

// The ids in the "Decision:" line. undefined: the body has no such line.
// Empty: the line names no Decision id.
export function findDecisionIds(body) {
  const line = body.match(DECISION_LINE)
  return line ? (line[1].match(DECISION_ID) ?? []) : undefined
}

// The Contract Version that the PR body names. undefined: the body has no
// "Contract:" line. null: the line does not read as <concept>@<version>.
export function findContractLine(body) {
  const line = body.match(CONTRACT_LINE)
  if (!line) return undefined
  const named = line[1].trim().match(CONTRACT_VERSION)
  return named ? { concept: named[1], version: Number(named[2]) } : null
}
