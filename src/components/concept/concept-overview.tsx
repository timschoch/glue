import { Title } from '@mantine/core'
import type { ReactNode } from 'react'

import type { Concept, RecordReference } from '../../db/concept.ts'
import { DecisionCard } from '../decisions/decision-card.tsx'
import { RecordField, RecordFields } from '../records/record-fields.tsx'
import { RecordLink } from '../records/record-link.tsx'
import { recordSections } from '../records/record-sections.ts'
import { RecordStatus } from '../records/record-status.tsx'
import classes from './concept-overview.module.css'

function Section<TRecord extends RecordReference>({
  section: { id, name },
  empty,
  records,
  cards = false,
  children,
}: {
  section: { id: string; name: string }
  empty: string
  records: ReadonlyArray<TRecord>
  cards?: boolean
  children: (record: TRecord) => ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-name`} className={classes.section}>
      <Title order={2} id={`${id}-name`} className={classes.name}>
        {name}
      </Title>
      {records.length === 0 ? (
        <p className={classes.empty}>{empty}</p>
      ) : (
        <ul className={classes.records} data-cards={cards || undefined}>
          {records.map((record) => (
            <li key={record.id}>{children(record)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Row({
  record,
  children,
}: {
  record: RecordReference
  children?: ReactNode
}) {
  return (
    <div className={classes.row}>
      <Title order={3} className={classes.title}>
        <RecordLink record={record} />
      </Title>
      {children && <RecordFields inline>{children}</RecordFields>}
    </div>
  )
}

export function ConceptOverview({ concept }: { concept: Concept | undefined }) {
  if (!concept) {
    return (
      <div className={classes.page}>
        <Title order={1}>No Concept yet</Title>
        <p className={classes.empty}>
          The Concept holds the Goals, Decisions and Guardrails of the Product.
          To add the first record, run <code>pnpm concept add</code>.
        </p>
      </div>
    )
  }

  const { product, goals, decisions, guardrails, insights, facts } = concept
  const sections = [
    { ...recordSections.goal, count: goals.length },
    { ...recordSections.decision, count: decisions.length },
    { ...recordSections.guardrail, count: guardrails.length },
    { ...recordSections.insight, count: insights.length },
    { ...recordSections.fact, count: facts.length },
  ]

  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <Title order={1}>{product.name}</Title>
        <nav aria-label="Sections">
          <ul className={classes.sections}>
            {sections.map(({ id, name, count }) => (
              <li key={id}>
                <a href={`#${id}`} className={classes.jump}>
                  {name} <span className={classes.count}>{count}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section
        section={recordSections.goal}
        empty="No Goals yet. A Goal is a target that the Product must reach."
        records={goals}
      >
        {(goal) => (
          <Row record={goal}>
            <RecordField label="Metric">{goal.metric}</RecordField>
          </Row>
        )}
      </Section>

      <Section
        section={recordSections.decision}
        empty="No Decisions yet. A Decision serves a Goal and links to its evidence."
        records={decisions}
        cards
      >
        {(decision) => <DecisionCard decision={decision} />}
      </Section>

      <Section
        section={recordSections.guardrail}
        empty="No Guardrails yet. A Guardrail is a rule that every change to the Product must respect."
        records={guardrails}
      >
        {(guardrail) => (
          <Row record={guardrail}>
            <RecordField label="Enforced by">
              {guardrail.enforcedBy}
            </RecordField>
          </Row>
        )}
      </Section>

      <Section
        section={recordSections.insight}
        empty="No Insights yet. An Insight is a finding from research, usage data or feedback."
        records={insights}
      >
        {(insight) => (
          <Row record={insight}>
            {insight.status && (
              <RecordField label="Status">
                <RecordStatus status={insight.status} />
              </RecordField>
            )}
            <RecordField label="Date">
              <time dateTime={insight.date}>{insight.date}</time>
            </RecordField>
          </Row>
        )}
      </Section>

      <Section
        section={recordSections.fact}
        empty="No Facts yet. A Fact is a verified statement: a constraint, a number, a contract."
        records={facts}
      >
        {(fact) => <Row record={fact} />}
      </Section>
    </div>
  )
}
