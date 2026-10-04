import type { Part, PartMeasure, PartSummary } from '../db/parts.ts'
import type { Reading } from '../design-system/card.tsx'
import type { RecordPart, RecordPartSummary } from '../design-system/record.tsx'

// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

type PartHref = (part: PartSummary) => string

function toRecordSummary(part: PartSummary, href: PartHref): RecordPartSummary {
  return {
    id: part.id,
    type: part.type,
    title: part.title,
    concept: part.conceptTitle,
    trust: part.trust,
    href: href(part),
  }
}

// The summaries of all Parts of the Project, for the record ids in a body.
export function toRecordSummaries(
  parts: ReadonlyArray<PartSummary>,
  href: PartHref,
): Array<RecordPartSummary> {
  return parts.map((part) => toRecordSummary(part, href))
}

const share = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
})
const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

// The newest value of a Goal or a Metric against its target, as its card
// shows it. A funnel is a share, a mean is a number.
export function toReading(measure: PartMeasure | null): Reading {
  if (!measure) return {}
  const format = measure.measure.kind === 'funnel' ? share : decimal
  const toText = (value: number | null) =>
    value === null ? undefined : format.format(value)

  return {
    value: toText(measure.latestValue),
    target: toText(measure.target),
    onTarget: measure.onTarget ?? undefined,
  }
}

// A Part as the record view shows it. `href` gives the address that opens a
// Part from this record. `parts` are the Parts of the Project: the cause of
// a flag is one of them.
export function toRecordPart(
  part: Part,
  href: PartHref,
  parts: ReadonlyArray<PartSummary> = [],
): RecordPart {
  const { measure } = part
  // A Goal or a Metric at the other end of a Joint shows its reading.
  const readings = new Map(
    part.measured.map((end) => [end.id, toReading(end.measure)]),
  )
  const toEnds = (ends: Part['needs']) =>
    ends.map(({ jointId, link, part: end }) => ({
      jointId,
      link,
      part: { ...toRecordSummary(end, href), reading: readings.get(end.id) },
    }))
  const findCause = (recordId: string) => {
    const found = parts.find(({ id }) => id === recordId)
    return found && toRecordSummary(found, href)
  }

  return {
    ...toRecordSummary(part, href),
    workState: part.workState,
    body: part.body,
    owner: part.owner,
    date: part.date,
    source: part.source,
    metric: part.metric,
    enforcedBy: part.enforcedBy,
    evidenceLevel: part.evidenceLevel,
    issueUrl: part.issueUrl,
    measure: measure && {
      baseline: measure.baseline,
      latestValue: measure.latestValue,
      target: measure.target,
      measuredAt: measure.measuredAt?.slice(0, DAY_LENGTH) ?? null,
    },
    supersededBy: part.supersededBy && toRecordSummary(part.supersededBy, href),
    supersedes: part.supersedes.map((other) => toRecordSummary(other, href)),
    needs: toEnds(part.needs),
    neededBy: toEnds(part.neededBy),
    signals: part.signals,
    question: part.question,
    unchosen: part.unchosen,
    flags: part.flags.flatMap(({ cause, reason }) => {
      const found = findCause(cause.id)
      return found ? { reason, part: found } : []
    }),
    activity: part.activity.map((entry) => {
      const cause = 'cause' in entry ? findCause(entry.cause.id) : undefined
      return {
        kind: entry.kind,
        at: entry.at,
        flag:
          cause && 'reason' in entry
            ? { reason: entry.reason, part: cause }
            : undefined,
      }
    }),
  }
}
