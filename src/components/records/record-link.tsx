import type { RecordReference } from '../../db/concept.ts'
import classes from './record-link.module.css'

// The id and the title of a record, without a link.
export function RecordTitle({ record }: { record: RecordReference }) {
  return (
    <>
      <span className={classes.id}>{record.id}</span>{' '}
      <span className={classes.name}>{record.title}</span>
    </>
  )
}
