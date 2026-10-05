import type { ExpectedPart, NewPart, PartChange } from '../db/part-records.ts'
import type { Part, PartType } from '../db/parts.ts'
import type { PartFormValues } from '../design-system/part-form.tsx'
import { isEvidence, listFormFields } from '../part-fields.ts'
import { todayUtc } from '../today-utc.ts'

// What goes between the Part form and the writes of the Part model.

// The fields of a Part that the form changes: the columns of the Part.
type Field = Exclude<keyof PartFormValues, 'goal' | 'evidence'>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// The fields of the Part type, from the values of the form or from the Part.
function pickFields<TSource extends Record<Field, unknown>>(
  type: PartType,
  source: TSource,
): Partial<Pick<TSource, Field>> {
  const picked: Partial<Pick<TSource, Field>> = {}
  const pick = <TField extends Field>(field: TField) => {
    picked[field] = source[field]
  }
  for (const field of listFormFields(type)) {
    if (field.kind !== 'joint') pick(field.name)
  }
  return picked
}

// The reason of each field with a wrong value. The form keeps Save off
// while a field has no value, so only the format is left to check.
export function findProblems(
  type: PartType,
  values: PartFormValues,
): Partial<Record<keyof PartFormValues, string>> {
  const dated = listFormFields(type).some(({ kind }) => kind === 'date')
  return dated && !ISO_DATE.test(values.date.trim())
    ? { date: `Enter a date, such as ${todayUtc()}.` }
    : {}
}

// The new Part of the form. A new Decision is proposed. One that supersedes
// a Decision is accepted, and the old one becomes superseded with it.
// `needs` are the Parts that the Part needs as Joints. A Decision needs the
// Goal and the evidence of the form before them.
export function toNewPart(
  type: PartType,
  values: PartFormValues,
  {
    concept,
    supersedes,
    needs,
  }: { concept: string; supersedes?: string; needs?: Array<string> },
): NewPart {
  const common = {
    concept,
    title: values.title,
    body: values.body,
    ...(needs && { needs }),
  }
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
        needs: [
          ...(values.goal ? [values.goal] : []),
          ...values.evidence,
          ...(needs ?? []),
        ],
        supersedes,
      }
    case 'guardrail':
      return { type, ...common, enforcedBy: values.enforcedBy }
    default:
      return { type, ...common }
  }
}

// The change of the form. `start` are the values that the form started
// with: a Decision gets a Goal only when the person picked another one.
export function toPartChange(
  type: PartType,
  values: PartFormValues,
  start: Pick<PartFormValues, 'goal'>,
): PartChange {
  const fields = pickFields(type, { ...values, date: values.date.trim() })
  return type === 'decision' && values.goal && values.goal !== start.goal
    ? { ...fields, goal: values.goal }
    : fields
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
    evidence: needed.filter(({ type }) => isEvidence(type)).map(({ id }) => id),
  }
}
