import { Title } from '@mantine/core'
import { Link, useParams } from '@tanstack/react-router'

import type { LinkedRecord } from '../../db/concept.ts'
import { DecisionActions } from '../decisions/decision-actions.tsx'
import { GoalActions } from '../goals/goal-actions.tsx'
import { GoalProgress } from '../goals/goal-progress.tsx'
import { InsightTriage } from '../insights/insight-triage.tsx'
import { useAnnouncer } from '../page/announcer.tsx'
import { RecordBody } from './record-body.tsx'
import { RecordField, RecordFields } from './record-fields.tsx'
import { RecordLink, RecordLinks, RecordTitle } from './record-link.tsx'
import {
  insightsNameId,
  recordSections,
  recordTitleId,
} from './record-sections.ts'
import { RecordStatus } from './record-status.tsx'
import classes from './record-view.module.css'
import type { RecordAction } from './use-record-action.ts'

type Handlers = {
  onKeep: RecordAction
  onDiscard: RecordAction
  onAccept: RecordAction
  onClose: RecordAction
  onReopen: RecordAction
}

// Only a web address is a link. Other text stays text, so it cannot run code.
function Source({ source }: { source: string }) {
  return /^https?:\/\//.test(source) && URL.canParse(source) ? (
    <a href={source} className={classes.source}>
      {source}
    </a>
  ) : (
    source
  )
}

// https://github.com/owner/name/issues/4 reads as owner/name#4. Other URLs stay as they are.
function formatIssueReference(issueUrl: string) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(
    issueUrl,
  )
  return match ? `${match[1]}#${match[2]}` : issueUrl
}

function Day({ date }: { date: string }) {
  return <time dateTime={date}>{date}</time>
}

// The fields of the record itself.
function OwnFields({ record }: { record: LinkedRecord }) {
  switch (record.kind) {
    case 'goal':
      return (
        <>
          <RecordField label="Status">
            <RecordStatus status={record.status} />
          </RecordField>
          <RecordField label="Metric">{record.metric}</RecordField>
          <RecordField label="Source">
            <Source source={record.source} />
          </RecordField>
        </>
      )
    case 'decision':
      return (
        <>
          <RecordField label="Status">
            <RecordStatus status={record.status} />
          </RecordField>
          <RecordField label="Date">
            <Day date={record.date} />
          </RecordField>
          <RecordField label="Owner">{record.owner}</RecordField>
        </>
      )
    case 'insight':
      return (
        <>
          {record.status && (
            <RecordField label="Status">
              <RecordStatus status={record.status} />
            </RecordField>
          )}
          <RecordField label="Date">
            <Day date={record.date} />
          </RecordField>
          <RecordField label="Source">
            <Source source={record.source} />
          </RecordField>
        </>
      )
    case 'fact':
      return (
        <RecordField label="Source">
          <Source source={record.source} />
        </RecordField>
      )
    case 'guardrail':
      return <RecordField label="Enforced by">{record.enforcedBy}</RecordField>
  }
}

// The accepted Decision is saved, but GitHub did not open its issue. The
// command opens the issue later.
function MissingIssue({ decisionId }: { decisionId: string }) {
  const { product } = useParams({ strict: false })

  return (
    <>
      Not opened: GitHub did not answer. To open it, run{' '}
      <code>
        pnpm concept downstream {decisionId} --project {product}
      </code>
    </>
  )
}

// The records that the record links to, and the records that link to it.
function LinkFields({
  record,
  issueMissing,
}: {
  record: Exclude<LinkedRecord, { kind: 'guardrail' }>
  issueMissing: boolean
}) {
  switch (record.kind) {
    case 'goal':
      return (
        <RecordField label="Decisions">
          <RecordLinks
            records={record.decisions}
            empty="No Decision serves this Goal yet"
          />
        </RecordField>
      )
    case 'decision':
      return (
        <>
          <RecordField label="Goal">
            <RecordLink record={record.goal} />
          </RecordField>
          <RecordField label="Evidence">
            <RecordLinks records={record.evidence} empty="No evidence yet" />
          </RecordField>
          {record.supersededBy && (
            <RecordField label="Superseded by">
              <RecordLink record={record.supersededBy} />
            </RecordField>
          )}
          {record.supersedes.length > 0 && (
            <RecordField label="Supersedes">
              <RecordLinks records={record.supersedes} empty="" />
            </RecordField>
          )}
          {record.issueUrl ? (
            <RecordField label="Issue">
              <a href={record.issueUrl} className={classes.source}>
                {formatIssueReference(record.issueUrl)}
              </a>
            </RecordField>
          ) : (
            issueMissing && (
              <RecordField label="Issue">
                <MissingIssue decisionId={record.id} />
              </RecordField>
            )
          )}
        </>
      )
    case 'insight':
      return (
        <RecordField label="Cited by">
          <RecordLinks
            records={record.decisions}
            empty="No Decision cites this Insight yet"
          />
        </RecordField>
      )
    case 'fact':
      return (
        <RecordField label="Cited by">
          <RecordLinks
            records={record.decisions}
            empty="No Decision cites this Fact yet"
          />
        </RecordField>
      )
  }
}

// A Goal, a draft Insight and a Decision that is not superseded have actions.
function Actions({
  record,
  onKeep,
  onDiscard,
  onAccept,
  onClose,
  onReopen,
}: { record: LinkedRecord } & Handlers) {
  const { announce } = useAnnouncer()

  // Says the result of an action that worked, and moves the focus.
  function announced(result: string, action: RecordAction, focusId: string) {
    return async () => {
      const failure = await action()
      if (!failure) announce(`${result} ${record.id}.`, focusId)
      return failure
    }
  }

  const actions =
    record.kind === 'goal' ? (
      <GoalActions
        goal={record}
        onClose={announced('Closed', onClose, recordTitleId)}
        onReopen={announced('Opened', onReopen, recordTitleId)}
      />
    ) : record.kind === 'insight' && record.status === 'draft' ? (
      <InsightTriage
        insight={record}
        citedBy={record.decisions.map(({ id }) => id)}
        onKeep={announced('Kept', onKeep, recordTitleId)}
        // The page of a discarded draft is gone: the overview comes next.
        onDiscard={announced('Discarded', onDiscard, insightsNameId)}
      />
    ) : record.kind === 'decision' && record.status !== 'superseded' ? (
      <DecisionActions
        decision={record}
        onAccept={announced('Accepted', onAccept, recordTitleId)}
      />
    ) : undefined

  return (
    actions && (
      <div role="group" aria-label="Actions">
        {actions}
      </div>
    )
  )
}

// `issueMissing`: the Decision was accepted a moment ago, and GitHub did
// not open its issue.
export function RecordView({
  record,
  issueMissing = false,
  ...handlers
}: { record: LinkedRecord; issueMissing?: boolean } & Handlers) {
  const section = recordSections[record.kind]
  const { claimFocus } = useAnnouncer()

  return (
    <article className={classes.page}>
      <header className={classes.header}>
        <nav aria-label="Breadcrumb">
          <ol className={classes.breadcrumb}>
            <li>
              <Link from="/$product" to="/$product" params={true}>
                Concept
              </Link>
            </li>
            <li>
              <Link
                from="/$product"
                to="/$product"
                params={true}
                hash={section.id}
              >
                {section.name}
              </Link>
            </li>
          </ol>
        </nav>
        <Title
          order={1}
          id={recordTitleId}
          tabIndex={-1}
          // The title of a Decision takes the focus after the form saved it.
          ref={claimFocus}
          className={classes.title}
        >
          <RecordTitle record={record} />
        </Title>
        <RecordFields inline>
          <OwnFields record={record} />
        </RecordFields>
        <Actions record={record} {...handlers} />
      </header>

      {record.kind === 'goal' && (
        <section aria-labelledby="progress-name" className={classes.section}>
          <Title order={2} id="progress-name">
            Progress
          </Title>
          <GoalProgress goal={record} />
        </section>
      )}

      <RecordBody body={record.body} />

      {record.kind !== 'guardrail' && (
        <section aria-labelledby="links-name" className={classes.section}>
          <Title order={2} id="links-name">
            Links
          </Title>
          <RecordFields>
            <LinkFields record={record} issueMissing={issueMissing} />
          </RecordFields>
        </section>
      )}
    </article>
  )
}
