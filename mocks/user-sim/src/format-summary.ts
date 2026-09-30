import type { Summary } from './summary.ts'

const REACHED = 'reached'
const MISSING = 'not found'
const ERRORS = 'error'
const GAP = 2

export function formatSummary(summary: Summary): string {
  const width = Math.max(
    'finished'.length,
    ...summary.steps.map((step) => step.intent.length),
  )
  const formatRow = (label: string, ...cells: Array<string>) =>
    label.padEnd(width) +
    [REACHED, MISSING, ERRORS]
      .map((header, index) =>
        (cells[index] ?? '').padStart(header.length + GAP),
      )
      .join('')
  return [
    formatRow('step', REACHED, MISSING, ERRORS),
    ...summary.steps.map((step) =>
      formatRow(
        step.intent,
        String(step.reached),
        String(step.missing),
        String(step.errors),
      ),
    ),
    `${formatRow('finished', String(summary.finished)).trimEnd()} of ${summary.users}`,
  ].join('\n')
}
