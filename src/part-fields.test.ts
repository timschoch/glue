import { describe, expect, it } from 'vitest'

import { newPartSchema } from './db/part-records.ts'
import { isEvidence, listFormFields, partFields } from './part-fields.ts'

type PartType = keyof typeof partFields

const types = Object.keys(partFields) as Array<PartType>

// Where a new Part goes. The schema takes the Joints of a Part as `needs`.
const PLACE = ['type', 'concept', 'needs', 'supersedes', 'supersededBy']

// The fields of the type in the schema of a new Part, each with the answer
// to: does the schema refuse a Part without it?
function listSchemaFields(type: PartType) {
  const option = newPartSchema.options.find(
    ({ shape }) => shape.type.value === type,
  )
  if (!option) throw new Error(`The schema has no type ${type}`)
  return Object.entries(option.shape)
    .filter(([name]) => !PLACE.includes(name))
    .map(([name, value]) => ({
      name,
      required: !value.safeParse(undefined).success,
    }))
}

const names = (fields: ReadonlyArray<{ name: string }>) =>
  fields.map(({ name }) => name).sort()

// The table needs these and the schema does not. The schema writes today
// for a Part without a date. The Goal and the evidence of a Decision go in
// as `needs`, and addPart refuses a Decision without them.
const NEEDED_BY_THE_TABLE_ONLY: Partial<Record<PartType, Array<string>>> = {
  insight: ['date'],
  decision: ['date', 'evidence', 'goal'],
}

describe('the fields of each Part type', () => {
  it.each(types)('are the fields of the schema of the type %s', (type) => {
    const fields = partFields[type].filter(({ kind }) => kind !== 'joint')

    expect(names(fields)).toEqual(names(listSchemaFields(type)))
  })

  it.each(types)('need what the schema of the type %s needs', (type) => {
    const fields = partFields[type].filter(({ required }) => required)
    const needed = listSchemaFields(type).filter(({ required }) => required)

    expect(names(fields)).toEqual(
      [...names(needed), ...(NEEDED_BY_THE_TABLE_ONLY[type] ?? [])].sort(),
    )
  })

  it.each([
    ['insight', ['title', 'body', 'source', 'date', 'evidenceLevel']],
    ['goal', ['title', 'body', 'metric', 'source']],
    ['decision', ['title', 'body', 'owner', 'date', 'goal', 'evidence']],
    ['guardrail', ['title', 'body', 'enforcedBy']],
    ['entity', ['title', 'body']],
    ['flow', ['title', 'body']],
    ['metric', ['title', 'body']],
  ] as const)('give the Part form the fields of the type %s', (type, shown) => {
    expect(listFormFields(type).map(({ name }) => name)).toEqual(shown)
  })
})

describe('the evidence of a Decision', () => {
  it.each([
    ['insight', true],
    ['guardrail', true],
    ['goal', false],
    ['decision', false],
    ['entity', false],
    ['flow', false],
    ['metric', false],
  ] as const)('a Part of the type %s is evidence: %s', (type, evidence) => {
    expect(isEvidence(type)).toBe(evidence)
  })
})
