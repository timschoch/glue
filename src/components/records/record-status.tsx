import type {
  DecisionStatus,
  GoalStatus,
  InsightStatus,
} from '../../db/concept-fields.ts'
import classes from './record-status.module.css'

type Status = DecisionStatus | GoalStatus | InsightStatus

const statusWords = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
  draft: 'Draft',
  open: 'Open',
  achieved: 'Achieved',
} satisfies Record<Status, string>

export function RecordStatus({ status }: { status: Status }) {
  return (
    <span className={classes.status} data-status={status}>
      {statusWords[status]}
    </span>
  )
}
