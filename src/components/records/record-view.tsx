import { Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import type { LinkedRecord } from '../../db/concept.ts'
import { RecordBody } from './record-body.tsx'
import { RecordField, RecordFields } from './record-fields.tsx'
import { RecordLink, RecordLinks, RecordTitle } from './record-link.tsx'
import { recordSections } from './record-sections.ts'
import { RecordStatus } from './record-status.tsx'
import classes from './record-view.module.css'

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

function Day({ date }: { date: string }) {
  return <time dateTime={date}>{date}</time>
}

// The fields of the record itself.
function OwnFields({ record }: { record: LinkedRecord }) {
  switch (record.kind) {
    case 'goal':
      return (
        <>
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

// The records that the record links to, and the records that link to it.
function LinkFields({
  record,
}: {
  record: Exclude<LinkedRecord, { kind: 'guardrail' }>
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

export function RecordView({ record }: { record: LinkedRecord }) {
  const section = recordSections[record.kind]

  return (
    <article className={classes.page}>
      <header className={classes.header}>
        <nav aria-label="Breadcrumb">
          <ol className={classes.breadcrumb}>
            <li>
              <Link to="/">Concept</Link>
            </li>
            <li>
              <Link to="/" hash={section.id}>
                {section.name}
              </Link>
            </li>
          </ol>
        </nav>
        <Title order={1} className={classes.title}>
          <RecordTitle record={record} />
        </Title>
        <RecordFields inline>
          <OwnFields record={record} />
        </RecordFields>
      </header>

      <RecordBody body={record.body} />

      {record.kind !== 'guardrail' && (
        <section aria-labelledby="links-name" className={classes.links}>
          <Title order={2} id="links-name">
            Links
          </Title>
          <RecordFields>
            <LinkFields record={record} />
          </RecordFields>
        </section>
      )}
    </article>
  )
}
