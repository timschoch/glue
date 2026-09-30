import { Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { Failure } from '../../authentication/session.ts'
import type { Concept, RecordReference } from '../../db/concept.ts'
import { DecisionCard } from '../decisions/decision-card.tsx'
import { InsightTriage, keepButtonId } from '../insights/insight-triage.tsx'
import { useAnnouncer } from '../page/announcer.tsx'
import { RecordField, RecordFields } from '../records/record-fields.tsx'
import { RecordLink } from '../records/record-link.tsx'
import { insightsNameId, recordSections } from '../records/record-sections.ts'
import { RecordStatus } from '../records/record-status.tsx'
import classes from './concept-overview.module.css'

// An action on the record with this id.
type RowAction = (recordId: string) => Promise<Failure | undefined>

function Section<TRecord extends RecordReference>({
  section: { id, name },
  empty,
  records,
  cards = false,
  action,
  children,
}: {
  section: { id: string; name: string }
  empty: string
  records: ReadonlyArray<TRecord>
  cards?: boolean
  action?: ReactNode
  children: (record: TRecord) => ReactNode
}) {
  // The name can get the focus: after the triage of the last draft, the
  // focus goes to the name of the Insights.
  const { claimFocus } = useAnnouncer()

  return (
    <section id={id} aria-labelledby={`${id}-name`} className={classes.section}>
      <div className={classes.top}>
        <Title
          order={2}
          id={`${id}-name`}
          tabIndex={-1}
          ref={claimFocus}
          className={classes.name}
        >
          {name}
        </Title>
        {action}
      </div>
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
  actions,
  children,
}: {
  record: RecordReference
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={classes.row}>
      <Title order={3} className={classes.title}>
        <RecordLink record={record} />
      </Title>
      {children && <RecordFields inline>{children}</RecordFields>}
      {actions}
    </div>
  )
}

export function ConceptOverview({
  concept,
  onKeep,
  onDiscard,
}: {
  concept: Concept
  onKeep: RowAction
  onDiscard: RowAction
}) {
  const { goals, decisions, guardrails, facts } = concept
  // The drafts are first: they are the work that waits for a person.
  const drafts = concept.insights.filter(({ status }) => status === 'draft')
  const insights = [
    ...drafts,
    ...concept.insights.filter(({ status }) => status !== 'draft'),
  ]
  const { announce } = useAnnouncer()

  // The draft is gone from the drafts after its triage, and so are its
  // buttons. The focus goes to the next draft, or to the name of the Insights.
  function triage(result: string, action: RowAction, index: number) {
    return async () => {
      const { id } = drafts[index]
      const next = drafts.at(index + 1)
      const failure = await action(id)
      if (!failure) {
        announce(
          `${result} ${id}.`,
          next ? keepButtonId(next.id) : insightsNameId,
        )
      }
      return failure
    }
  }

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
        <Title order={1}>Concept</Title>
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
        {drafts.length > 0 && (
          <p className={classes.triage}>
            <a href={`#${recordSections.insight.id}`} className={classes.jump}>
              {drafts.length} draft{' '}
              {drafts.length === 1 ? 'Insight' : 'Insights'} to triage
            </a>
          </p>
        )}
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
        action={
          <Link
            from="/$product"
            to="/$product/decisions/new"
            params={true}
            className={classes.jump}
          >
            Propose a Decision
          </Link>
        }
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
          <Row
            record={insight}
            actions={
              insight.status === 'draft' && (
                <InsightTriage
                  insight={insight}
                  citedBy={decisions
                    .filter(({ evidence }) =>
                      evidence.some(({ id }) => id === insight.id),
                    )
                    .map(({ id }) => id)}
                  onKeep={triage('Kept', onKeep, drafts.indexOf(insight))}
                  onDiscard={triage(
                    'Discarded',
                    onDiscard,
                    drafts.indexOf(insight),
                  )}
                />
              )
            }
          >
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
