import type { Part, PartSummary } from '../db/parts.ts'
import type { Trust, WorkState } from '../design-system/card.tsx'
import type { ConceptViewPart } from '../design-system/concept-view.tsx'
import type { RecordPart, RecordPartSummary } from '../design-system/record.tsx'

// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

// The Part model has no Trust and no Work state yet. Until it has, both come
// from the status: a Part that waits for its sign-off is not ready, a
// superseded Decision is discontinued.
export function trustOf(status: string | null): Trust {
  if (status === 'superseded') return 'wrong'
  return status === 'proposed' || status === 'draft' ? 'not-ready' : 'solid'
}

function workStateOf(status: string | null): WorkState {
  if (status === 'draft') return 'draft'
  return status === 'proposed' ? 'review' : 'published'
}

export function toConceptViewPart(part: PartSummary): ConceptViewPart {
  return { ...part, trust: trustOf(part.status) }
}

type PartHref = (part: PartSummary) => string

function toRecordSummary(part: PartSummary, href: PartHref): RecordPartSummary {
  return {
    id: part.id,
    type: part.type,
    title: part.title,
    concept: part.conceptTitle,
    trust: trustOf(part.status),
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

// The target of a measure. A mean wants a change from its baseline.
function target({ measure, baseline }: NonNullable<Part['measure']>) {
  if (measure.kind === 'funnel') return measure.target
  return baseline === null ? null : baseline + measure.target_change
}

// A Part as the record view shows it. `href` gives the address that opens a
// Part from this record.
export function toRecordPart(part: Part, href: PartHref): RecordPart {
  const { measure } = part
  const toEnds = (ends: Part['needs']) =>
    ends.map(({ jointId, link, part: end }) => ({
      jointId,
      link,
      part: toRecordSummary(end, href),
    }))

  return {
    ...toRecordSummary(part, href),
    workState: workStateOf(part.status),
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
      target: target(measure),
      measuredAt: measure.measuredAt?.slice(0, DAY_LENGTH) ?? null,
    },
    supersededBy: part.supersededBy && toRecordSummary(part.supersededBy, href),
    supersedes: part.supersedes.map((other) => toRecordSummary(other, href)),
    needs: toEnds(part.needs),
    neededBy: toEnds(part.neededBy),
  }
}
