import type { Summary } from './simulate.ts'

const REACHED = 'reached'
const MISSING = 'not found'
const GAP = 2

export function formatSummary(summary: Summary): string {
  const width = Math.max(
    'finished'.length,
    ...summary.steps.map((step) => step.intent.length),
  )
  const row = (label: string, reached: string, missing: string) =>
    label.padEnd(width) +
    reached.padStart(REACHED.length + GAP) +
    missing.padStart(MISSING.length + GAP)
  return [
    row('step', REACHED, MISSING),
    ...summary.steps.map((step) =>
      row(step.intent, String(step.reached), String(step.missing)),
    ),
    `${row('finished', String(summary.finished), '').trimEnd()} of ${summary.users}`,
  ].join('\n')
}
