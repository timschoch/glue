import { describe, expect, it, vi } from 'vitest'

import type { PartFormValues } from '../design-system/part-form.tsx'
import { findPart } from '../test/project.ts'
import {
  findEmptyStep,
  findProblems,
  toExpectedPart,
  toFormValues,
  toNewPart,
  toPartChange,
} from './part-form-values.ts'

const values: PartFormValues = {
  title: 'Show the video of the creator',
  body: 'It follows #I3.',
  metric: 'Tickets',
  source: 'interviews',
  date: '2026-10-04',
  enforcedBy: 'verify ci',
  goal: 'G1',
  evidence: ['I3', 'R1'],
  steps: [
    { text: 'Open the cart', entity: 'E1' },
    { text: ' ', entity: null },
  ],
  fields: [
    { name: 'total', meaning: 'The sum to pay' },
    { name: '', meaning: 'No name yet' },
  ],
  responsible: 'ada@example.com',
  sameMeaning: false,
}

const place = { concept: 'part-model' }

describe('the Part that the form adds', () => {
  it('is a proposed Decision that needs its Goal and its evidence', () => {
    expect(toNewPart('decision', values, place)).toEqual({
      type: 'decision',
      concept: 'part-model',
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      responsible: 'ada@example.com',
      date: '2026-10-04',
      status: 'proposed',
      needs: ['G1', 'I3', 'R1'],
      supersedes: undefined,
    })
  })

  it('is an accepted Decision when it supersedes a Decision', () => {
    expect(
      toNewPart('decision', values, { ...place, supersedes: 'D4' }),
    ).toMatchObject({ status: 'accepted', supersedes: 'D4' })
  })

  it('needs the Part of the record that it was added from', () => {
    expect(
      toNewPart('flow', values, { ...place, needs: ['D4'] }),
    ).toMatchObject({ type: 'flow', needs: ['D4'] })
  })

  it('is a Decision that needs the Part of the record after its Goal and its evidence', () => {
    expect(
      toNewPart('decision', values, { ...place, needs: ['E2'] }),
    ).toMatchObject({ type: 'decision', needs: ['G1', 'I3', 'R1', 'E2'] })
  })

  it.each([
    ['insight', ['source', 'date']],
    ['goal', ['metric', 'source']],
    ['guardrail', ['enforcedBy']],
    ['entity', ['fields']],
    ['flow', ['steps']],
    ['metric', []],
  ] as const)('has only the fields of the type %s', (type, fields) => {
    expect(Object.keys(toNewPart(type, values, place)).sort()).toEqual(
      ['type', 'concept', 'title', 'body', 'responsible', ...fields].sort(),
    )
  })

  it('has each step of a Flow, and the fields of an Entity with a name', () => {
    expect(toNewPart('flow', values, place)).toMatchObject({
      steps: [
        { text: 'Open the cart', entity: 'E1' },
        { text: ' ', entity: null },
      ],
    })
    expect(toNewPart('entity', values, place)).toMatchObject({
      fields: [{ name: 'total', meaning: 'The sum to pay' }],
    })
  })
})

describe('the values of the Part form', () => {
  it.each(['insight', 'decision'] as const)(
    'names a date of the type %s that is no date',
    (type) => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T12:00Z') })
      try {
        expect(findProblems(type, { ...values, date: '4.10.2026' })).toEqual({
          date: 'Enter a date, such as 2026-10-04.',
        })
      } finally {
        vi.useRealTimers()
      }
      expect(findProblems(type, values)).toEqual({})
    },
  )

  it('names the field of an Entity that is there twice', () => {
    const fields = [
      { name: 'total', meaning: 'The sum to pay' },
      { name: ' total ', meaning: 'The sum with tax' },
      { name: '', meaning: '' },
      { name: '', meaning: '' },
    ]

    expect(findProblems('entity', { ...values, fields })).toEqual({
      fields: 'A field has one name. "total" is there twice.',
    })
    expect(findProblems('entity', values)).toEqual({})
  })

  it('names the first step of a Flow with no text', () => {
    const steps = [{ text: 'Open the cart', entity: 'E1' }]

    expect(findProblems('flow', values)).toEqual({ steps: 'Enter a text.' })
    expect(findEmptyStep(values.steps)).toBe(1)
    expect(findProblems('flow', { ...values, steps })).toEqual({})
    expect(findEmptyStep(steps)).toBe(-1)
  })

  it('asks no date of a type without one', () => {
    expect(findProblems('goal', { ...values, date: '' })).toEqual({})
  })
})

describe('the Part that the form edits', () => {
  const part = findPart({ project: 'glue', recordId: 'D4' })
  if (!part) throw new Error('the test Project has no D4')
  const decision = { ...part, owner: 'Ada', date: '2026-01-15' }
  // The form started with the Goal and the Responsible of the values.
  const start = { goal: 'G1', responsible: 'ada@example.com' }

  it('gives the form its values, with no text for a missing value', () => {
    expect(toFormValues(decision, 'ada@example.com')).toEqual({
      title: 'The Concept lives in the database',
      body: 'It follows #I3 and #D9.',
      metric: '',
      source: '',
      date: '2026-01-15',
      enforcedBy: '',
      goal: 'G1',
      evidence: ['I3'],
      steps: [],
      fields: [],
      responsible: 'ada@example.com',
      sameMeaning: false,
    })
  })

  it('changes the fields of its type only', () => {
    expect(toPartChange('decision', values, start)).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      date: '2026-10-04',
    })
  })

  it('gives a Part the member that the person picked as its owner', () => {
    expect(
      toPartChange('decision', values, {
        ...start,
        responsible: 'bo@example.com',
      }),
    ).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      date: '2026-10-04',
      owner: 'ada@example.com',
    })
  })

  it('takes the owner of a Part away when the person picked nobody', () => {
    expect(toPartChange('flow', { ...values, responsible: '' }, start)).toEqual(
      {
        title: 'Show the video of the creator',
        body: 'It follows #I3.',
        steps: values.steps,
        owner: null,
      },
    )
  })

  it('names no owner for a Part that had none and gets none', () => {
    expect(
      toPartChange(
        'flow',
        { ...values, responsible: '' },
        { ...start, responsible: '' },
      ),
    ).not.toHaveProperty('owner')
  })

  it('gives a Decision the Goal that the person picked in the place of its Goal', () => {
    expect(toPartChange('decision', values, { ...start, goal: 'G2' })).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      date: '2026-10-04',
      goal: 'G1',
    })
  })

  it('is a wording fix when the person says that the meaning is the same', () => {
    expect(
      toPartChange('flow', { ...values, sameMeaning: true }, start),
    ).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      steps: values.steps,
      sameMeaning: true,
    })
  })

  it('gives no other type a Goal', () => {
    expect(toPartChange('flow', values, start)).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      steps: values.steps,
    })
  })

  it('gives an Entity the fields that have a name', () => {
    expect(toPartChange('entity', values, start)).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      fields: [{ name: 'total', meaning: 'The sum to pay' }],
    })
  })

  it('expects the steps of a Flow and the fields of an Entity that the person saw', () => {
    const steps = [{ text: 'Open the cart', entity: null }]
    const fields = [{ name: 'total', meaning: 'The sum to pay' }]

    expect(toExpectedPart({ ...part, type: 'flow', steps })).toEqual({
      title: 'The Concept lives in the database',
      body: 'It follows #I3 and #D9.',
      steps,
    })
    expect(toExpectedPart({ ...part, type: 'entity', fields })).toEqual({
      title: 'The Concept lives in the database',
      body: 'It follows #I3 and #D9.',
      fields,
    })
  })

  it('expects the values that the person saw', () => {
    expect(toExpectedPart(decision)).toEqual({
      title: 'The Concept lives in the database',
      body: 'It follows #I3 and #D9.',
      date: '2026-01-15',
    })
  })
})
