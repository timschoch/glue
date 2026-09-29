import { Anchor, Title } from '@mantine/core'
import { Fragment } from 'react'
import classes from './decision-card.module.css'

export type ConceptRecord = {
  id: string
  title: string
  href: string
}

export type Decision = ConceptRecord & {
  date: string
  owner: string
  status: 'proposed' | 'accepted' | 'superseded'
  goal: ConceptRecord
  evidence: ReadonlyArray<ConceptRecord>
}

const statusWords = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
} satisfies Record<Decision['status'], string>

export function DecisionCard({ decision }: { decision: Decision }) {
  const links = [
    { label: 'Goal', records: [decision.goal] },
    { label: 'Evidence', records: decision.evidence },
  ]

  return (
    <article className={classes.card}>
      <Title order={2} className={classes.title}>
        <Anchor
          href={decision.href}
          inherit
          underline="hover"
          className={classes.reference}
        >
          <span className={classes.id}>{decision.id}</span>{' '}
          <span className={classes.name}>{decision.title}</span>
        </Anchor>
      </Title>
      <p className={classes.meta}>
        <span className={classes.status} data-status={decision.status}>
          {statusWords[decision.status]}
        </span>{' '}
        <time dateTime={decision.date}>{decision.date}</time>{' '}
        <span>{decision.owner}</span>
      </p>
      <dl className={classes.links}>
        {links.map(({ label, records }) => (
          <Fragment key={label}>
            <dt className={classes.label}>{label}</dt>
            <dd className={classes.value}>
              <ul className={classes.records}>
                {records.map((record) => (
                  <li key={record.id}>
                    <Anchor
                      href={record.href}
                      inherit
                      underline="hover"
                      className={classes.reference}
                    >
                      <span className={classes.id}>{record.id}</span>{' '}
                      <span className={classes.name}>{record.title}</span>
                    </Anchor>
                  </li>
                ))}
              </ul>
            </dd>
          </Fragment>
        ))}
      </dl>
    </article>
  )
}
