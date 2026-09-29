import { Link } from '@tanstack/react-router'

import type { RecordReference } from '../../db/concept.ts'
import classes from './record-link.module.css'

// A record reference without a link, for the heading of the record's own page.
export function RecordTitle({ record }: { record: RecordReference }) {
  return (
    <>
      <span className={classes.id}>{record.id}</span>{' '}
      <span className={classes.name}>{record.title}</span>
    </>
  )
}

export function RecordLink({ record }: { record: RecordReference }) {
  return (
    <Link
      to="/concept/$recordId"
      params={{ recordId: record.id }}
      className={classes.reference}
    >
      <RecordTitle record={record} />
    </Link>
  )
}

// The records that a record links to, or a sentence when there are none.
export function RecordLinks({
  records,
  empty,
}: {
  records: ReadonlyArray<RecordReference>
  empty: string
}) {
  if (records.length === 0)
    return <span className={classes.empty}>{empty}</span>

  return (
    <ul className={classes.records}>
      {records.map((record) => (
        <li key={record.id}>
          <RecordLink record={record} />
        </li>
      ))}
    </ul>
  )
}
