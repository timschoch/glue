// The fields of each Part type, as one table. The Part form, its values and
// the help of `pnpm concept` read it. The schemas in db/part-records.ts hold
// the rule of each value, and part-fields.test.ts holds them to the table.
// It imports nothing, so the server and the browser read it.

export type PartField = {
  name: string
  // `joint`: the record ids of the Parts that the Part needs.
  kind: 'text' | 'date' | 'choice' | 'number' | 'texts' | 'joint' | 'json'
  // A new Part needs a value.
  required: boolean
  // The label in the Part form. None: the form has no such field.
  label?: string
  // The flag of `pnpm concept`. None: the name is the flag.
  flag?: string
}

const title = {
  name: 'title',
  kind: 'text',
  required: true,
  label: 'Title',
} as const
const body = {
  name: 'body',
  kind: 'text',
  required: false,
  label: 'Body',
} as const
// The name or the e-mail address of a member: the Responsible of the Part.
// The Part form has the control Responsible in its place.
const owner = { name: 'owner', kind: 'text', required: false } as const
const source = { name: 'source', kind: 'text', required: false } as const
const neededSource = { ...source, required: true, label: 'Source' } as const
// The schema takes a new Part without a date and writes today.
const date = {
  name: 'date',
  kind: 'date',
  required: true,
  label: 'Date',
} as const
const measure = { name: 'measure', kind: 'json', required: false } as const

// The fields with a label are in the order of the Part form.
export const partFields = {
  insight: [
    title,
    body,
    neededSource,
    date,
    {
      name: 'evidenceLevel',
      kind: 'choice',
      required: false,
      flag: 'level',
    },
    { name: 'status', kind: 'choice', required: false },
    owner,
  ],
  goal: [
    title,
    body,
    { name: 'metric', kind: 'text', required: true, label: 'Metric' },
    neededSource,
    { name: 'status', kind: 'choice', required: false },
    measure,
    owner,
  ],
  decision: [
    title,
    body,
    owner,
    date,
    { name: 'status', kind: 'choice', required: true },
    { name: 'goal', kind: 'joint', required: true, label: 'Goal' },
    { name: 'evidence', kind: 'joint', required: true, label: 'Evidence' },
    { name: 'options', kind: 'texts', required: false, flag: 'option' },
    { name: 'pick', kind: 'number', required: false },
    source,
  ],
  guardrail: [
    title,
    body,
    {
      name: 'enforcedBy',
      kind: 'text',
      required: true,
      label: 'Enforced by',
      flag: 'enforced-by',
    },
    owner,
    source,
  ],
  entity: [
    title,
    body,
    { name: 'fields', kind: 'json', required: false, label: 'Fields' },
    owner,
    source,
  ],
  flow: [
    title,
    body,
    { name: 'steps', kind: 'json', required: false, label: 'Steps' },
    owner,
    source,
  ],
  metric: [title, body, measure, owner, source],
} as const satisfies Record<string, ReadonlyArray<PartField>>

type PartType = keyof typeof partFields

type Field = (typeof partFields)[PartType][number]

export type FormField = Extract<Field, { label: string }>

// The Part types that a Decision takes as evidence (D44). The form, its
// values, `pnpm concept`, the Downstream issue and the server read it.
export const evidenceTypes = ['insight', 'guardrail'] as const

export function isEvidence(type: PartType): boolean {
  const types: ReadonlyArray<PartType> = evidenceTypes
  return types.includes(type)
}

// The place of the first field of an Entity that has the name of a field
// before it, or -1. An Entity has one field of each name. A field without
// a name is none. The form, its values and the server read it.
export function findRepeatedField(
  fields: ReadonlyArray<{ name: string }>,
): number {
  const names = fields.map(({ name }) => name.trim())
  return names.findIndex(
    (name, index) => name !== '' && names.indexOf(name) < index,
  )
}

// The fields of the Part type that the Part form shows, in its order.
export function listFormFields(type: PartType): ReadonlyArray<FormField> {
  const fields: ReadonlyArray<Field> = partFields[type]
  return fields.filter((field): field is FormField => 'label' in field)
}
