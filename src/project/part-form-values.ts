import type { ExpectedPart, NewPart, PartChange } from '../db/part-records.ts'
import type { Part, PartType } from '../db/parts.ts'
import type { PartFormValues } from '../design-system/part-form.tsx'
import {
  findRepeatedField,
  isEvidence,
  listFormFields,
} from '../part-fields.ts'
import { todayUtc } from '../today-utc.ts'

// What goes between the Part form and the writes of the Part model.

// The fields of a Part that the form changes: the columns of the Part.
type Field = Exclude<
  keyof PartFormValues,
  'goal' | 'evidence' | 'responsible' | 'sameMeaning'
>

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

// The values as a write takes them: the date without spaces around it, and
// only the fields with a name. A row that the person added and left empty
// is no field.
function toFilled(values: PartFormValues) {
  return {
    ...values,
    date: values.date.trim(),
    fields: values.fields.filter(({ name }) => name.trim() !== ''),
  }
}

// The place of the first step with no text. -1: each step has a text.
export function findEmptyStep(steps: PartFormValues['steps']): number {
  return steps.findIndex(({ text }) => text.trim() === '')
}

// The reason of each field with a wrong value. The form keeps Save off
// while a field has no value, so only the format of the date, the names of
// the fields of an Entity and the texts of the steps of a Flow are left to
// check.
export function findProblems(
  type: PartType,
  values: PartFormValues,
): Partial<Record<keyof PartFormValues, string>> {
  const names = listFormFields(type).map(({ name }) => name)
  const repeated = names.includes('fields')
    ? findRepeatedField(values.fields)
    : -1
  return {
    ...(names.includes('date') &&
      !ISO_DATE.test(values.date.trim()) && {
        date: `Enter a date, such as ${todayUtc()}.`,
      }),
    ...(names.includes('steps') &&
      findEmptyStep(values.steps) !== -1 && { steps: 'Enter a text.' }),
    ...(repeated !== -1 && {
      fields: `A field has one name. "${values.fields[repeated].name.trim()}" is there twice.`,
    }),
  }
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
    ...(values.responsible && { responsible: values.responsible }),
    ...(needs && { needs }),
  }
  const { date, fields } = toFilled(values)
  switch (type) {
    case 'insight':
      return {
        type,
        ...common,
        source: values.source,
        date,
      }
    case 'goal':
      return { type, ...common, metric: values.metric, source: values.source }
    case 'decision':
      return {
        type,
        ...common,
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
    case 'entity':
      return { type, ...common, fields }
    case 'flow':
      return { type, ...common, steps: [...values.steps] }
    default:
      return { type, ...common }
  }
}

// The change of the form. `start` are the values that the form started
// with: a Decision gets a Goal only when the person picked another one,
// and a Part gets an owner only when the person picked another member.
// Nobody picked takes the owner away: a Decision keeps its owner, it needs
// one. The change is a wording fix when the person said so.
export function toPartChange(
  type: PartType,
  values: PartFormValues,
  start: Pick<PartFormValues, 'goal' | 'responsible'>,
): PartChange {
  return {
    ...pickFields(type, toFilled(values)),
    ...(values.responsible !== start.responsible &&
      (values.responsible !== '' || type !== 'decision') && {
        owner: values.responsible || null,
      }),
    ...(type === 'decision' &&
      values.goal &&
      values.goal !== start.goal && { goal: values.goal }),
    ...(values.sameMeaning && { sameMeaning: true }),
  }
}

// The values that the person saw in the form. The write changes nothing
// when a second person changed one of them: a text, a step of a Flow or a
// field of an Entity.
export function toExpectedPart(part: Part): ExpectedPart {
  return pickFields(part.type, part)
}

// The values that the form starts with: the fields of the Part, and for a
// Decision its Goal and its evidence. `responsible` is the e-mail address
// of the member who owns the Part.
export function toFormValues(part: Part, responsible = ''): PartFormValues {
  const needed = part.needs.map((end) => end.part)
  return {
    title: part.title,
    body: part.body,
    metric: part.metric ?? '',
    source: part.source ?? '',
    date: part.date ?? '',
    enforcedBy: part.enforcedBy ?? '',
    goal: needed.find(({ type }) => type === 'goal')?.id ?? null,
    evidence: needed.filter(({ type }) => isEvidence(type)).map(({ id }) => id),
    steps: part.steps,
    fields: part.fields,
    responsible,
    sameMeaning: false,
  }
}
