import type { ReactNode } from 'react'

import classes from './record-fields.module.css'

// Label and value pairs. `inline` puts short pairs in one line that wraps.
export function RecordFields({
  inline = false,
  children,
}: {
  inline?: boolean
  children: ReactNode
}) {
  return (
    <dl className={classes.fields} data-inline={inline || undefined}>
      {children}
    </dl>
  )
}

export function RecordField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className={classes.field}>
      <dt className={classes.label}>{label}</dt>
      <dd className={classes.value}>{children}</dd>
    </div>
  )
}
