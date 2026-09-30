import type { Goal } from '../../db/concept.ts'
import { RecordField, RecordFields } from '../records/record-fields.tsx'
import classes from './goal-progress.module.css'

const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const change = new Intl.NumberFormat('en', {
  maximumFractionDigits: 2,
  signDisplay: 'always',
})
const share = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
})

// A value that a measure read, with two decimals at most.
export function formatValue(value: number) {
  return decimal.format(value)
}

// `2026-09-30T14:05:12.000Z` reads as `2026-09-30 14:05 UTC`.
function formatTime(time: string) {
  return `${time.slice(0, 16).replace('T', ' ')} UTC`
}

const NOT_MEASURED = 'Not measured yet'

// How far a Goal is: what the first measure read, what the last one read
// and when, and where the Goal wants to be.
export function GoalProgress({
  goal: { measure, baseline, latestValue, measuredAt },
}: {
  goal: Goal
}) {
  if (measure === null) {
    return (
      <RecordFields>
        <RecordField label="Measure">
          None, so Glue does not measure this Goal
        </RecordField>
      </RecordFields>
    )
  }

  if (measure.kind === 'funnel') {
    return (
      <RecordFields>
        <RecordField label="Target">
          {share.format(measure.target)} from the first step to the last
        </RecordField>
      </RecordFields>
    )
  }

  const targetChange = change.format(measure.target_change)

  return (
    <RecordFields>
      <RecordField label="Baseline">
        {baseline === null ? NOT_MEASURED : formatValue(baseline)}
      </RecordField>
      <RecordField label="Latest value">
        {latestValue === null || measuredAt === null ? (
          NOT_MEASURED
        ) : (
          <>
            {formatValue(latestValue)}, measured{' '}
            <time dateTime={measuredAt} className={classes.time}>
              {formatTime(measuredAt)}
            </time>
          </>
        )}
      </RecordField>
      <RecordField label="Target">
        {baseline === null
          ? `The baseline ${targetChange}`
          : `${formatValue(baseline + measure.target_change)}, the baseline ${targetChange}`}
      </RecordField>
    </RecordFields>
  )
}
