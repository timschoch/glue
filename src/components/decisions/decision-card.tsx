import { Title } from '@mantine/core'

import type { DecisionSummary } from '../../db/concept.ts'
import { RecordField, RecordFields } from '../records/record-fields.tsx'
import { RecordLink, RecordLinks } from '../records/record-link.tsx'
import { RecordStatus } from '../records/record-status.tsx'
import classes from './decision-card.module.css'

export function DecisionCard({ decision }: { decision: DecisionSummary }) {
  return (
    <article className={classes.card}>
      <Title order={3} size="h2" className={classes.title}>
        <RecordLink record={decision} />
      </Title>
      <RecordFields inline>
        <RecordField label="Status">
          <RecordStatus status={decision.status} />
        </RecordField>
        <RecordField label="Date">
          <time dateTime={decision.date}>{decision.date}</time>
        </RecordField>
        <RecordField label="Owner">{decision.owner}</RecordField>
      </RecordFields>
      <RecordFields>
        <RecordField label="Goal">
          <RecordLink record={decision.goal} />
        </RecordField>
        <RecordField label="Evidence">
          <RecordLinks records={decision.evidence} empty="No evidence yet" />
        </RecordField>
      </RecordFields>
    </article>
  )
}
