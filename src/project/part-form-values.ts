import type { ExpectedPart, NewPart, PartChange } from '../db/part-records.ts'
import type { Part, PartType } from '../db/parts.ts'
import type { PartFormValues } from '../design-system/part-form.tsx'

// What goes between the Part form and the writes of the Part model.

// The fields of a Part that the form changes: the columns of the Part.
type Field = Exclude<keyof PartFormValues, 'goal' | 'evidence'>

// The fields that only one Part type has, after the title and the body.
const typeFields = {
  insight: ['source', 'date', 'evidenceLevel'],
  goal: ['metric', 'source'],
  decision: ['owner', 'date'],
  guardrail: ['enforcedBy'],
  entity: [],
  flow: [],
  metric: [],
} as const satisfies Record<PartType, ReadonlyArray<Field>>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

export function todayUtc(): string {
  return new Date().toISOString().slice(0, DAY_LENGTH)
}

// The fields of the Part type, from the values of the form or from the Part.
function pickFields<TSource extends Record<Field, unknown>>(
  type: PartType,
  source: TSource,
): Partial<Pick<TSource, Field>> {
  const picked: Partial<Pick<TSource, Field>> = {}
  const pick = <TField extends Field>(field: TField) => {
    picked[field] = source[field]
  }
  pick('title')
  pick('body')
  typeFields[type].forEach(pick)
  return picked
}

// The reason of each field with a wrong value. The form keeps Save off
// while a field has no value, so only the format is left to check.
export function findProblems(
  type: PartType,
  values: PartFormValues,
): Partial<Record<keyof PartFormValues, string>> {
  const dated = type === 'insight' || type === 'decision'
  return dated && !ISO_DATE.test(values.date.trim())
    ? { date: `Enter a date, such as ${todayUtc()}.` }
    : {}
}

// The new Part of the form. A new Decision is proposed. One that supersedes
// a Decision is accepted, and the old one becomes superseded with it.
export function toNewPart(
  type: PartType,
  values: PartFormValues,
  { concept, supersedes }: { concept: string; supersedes?: string },
): NewPart {
  const common = { concept, title: values.title, body: values.body }
  const date = values.date.trim()
  switch (type) {
    case 'insight':
      return {
        type,
        ...common,
        source: values.source,
        date,
        evidenceLevel: values.evidenceLevel,
      }
    case 'goal':
      return { type, ...common, metric: values.metric, source: values.source }
    case 'decision':
      return {
        type,
        ...common,
        owner: values.owner,
        date,
        status: supersedes ? 'accepted' : 'proposed',
        needs: [...(values.goal ? [values.goal] : []), ...values.evidence],
        supersedes,
      }
    case 'guardrail':
      return { type, ...common, enforcedBy: values.enforcedBy }
    default:
      return { type, ...common }
  }
}

export function toPartChange(
  type: PartType,
  values: PartFormValues,
): PartChange {
  return pickFields(type, { ...values, date: values.date.trim() })
}

// The values that the person saw in the form. The write changes nothing
// when a second person changed one of them.
export function toExpectedPart(part: Part): ExpectedPart {
  return pickFields(part.type, part)
}

// The values that the form starts with: the fields of the Part, and for a
// Decision its Goal and its evidence.
export function toFormValues(part: Part): PartFormValues {
  const needed = part.needs.map((end) => end.part)
  return {
    title: part.title,
    body: part.body,
    metric: part.metric ?? '',
    source: part.source ?? '',
    owner: part.owner ?? '',
    date: part.date ?? '',
    evidenceLevel: part.evidenceLevel,
    enforcedBy: part.enforcedBy ?? '',
    goal: needed.find(({ type }) => type === 'goal')?.id ?? null,
    evidence: needed
      .filter(({ type }) => type === 'insight' || type === 'guardrail')
      .map(({ id }) => id),
  }
}
