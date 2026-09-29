import type { DecisionStatus, InsightStatus } from '../../db/schema.ts'
import classes from './record-status.module.css'

type Status = DecisionStatus | InsightStatus

const statusWords = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
  draft: 'Draft',
} satisfies Record<Status, string>

export function RecordStatus({ status }: { status: Status }) {
  return (
    <span className={classes.status} data-status={status}>
      {statusWords[status]}
    </span>
  )
}
