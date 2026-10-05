import { describe, expect, it, vi } from 'vitest'

import type { PartFormValues } from '../design-system/part-form.tsx'
import { findPart } from '../test/project.ts'
import {
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
  owner: 'Ada',
  date: '2026-10-04',
  evidenceLevel: 'pattern',
  enforcedBy: 'verify ci',
  goal: 'G1',
  evidence: ['I3', 'R1'],
}

const place = { concept: 'part-model' }

describe('the Part that the form adds', () => {
  it('is a proposed Decision that needs its Goal and its evidence', () => {
    expect(toNewPart('decision', values, place)).toEqual({
      type: 'decision',
      concept: 'part-model',
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      owner: 'Ada',
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
    ['insight', ['source', 'date', 'evidenceLevel']],
    ['goal', ['metric', 'source']],
    ['guardrail', ['enforcedBy']],
    ['entity', []],
    ['flow', []],
    ['metric', []],
  ] as const)('has only the fields of the type %s', (type, fields) => {
    expect(Object.keys(toNewPart(type, values, place)).sort()).toEqual(
      ['type', 'concept', 'title', 'body', ...fields].sort(),
    )
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

  it('asks no date of a type without one', () => {
    expect(findProblems('goal', { ...values, date: '' })).toEqual({})
  })
})

describe('the Part that the form edits', () => {
  const part = findPart({ project: 'glue', recordId: 'D4' })
  if (!part) throw new Error('the test Project has no D4')
  const decision = { ...part, owner: 'Ada', date: '2026-01-15' }

  it('gives the form its values, with no text for a missing value', () => {
    expect(toFormValues(decision)).toEqual({
      title: 'The Concept lives in the database',
      body: 'It follows #I3 and #D9.',
      metric: '',
      source: '',
      owner: 'Ada',
      date: '2026-01-15',
      evidenceLevel: null,
      enforcedBy: '',
      goal: 'G1',
      evidence: ['I3'],
    })
  })

  it('changes the fields of its type only', () => {
    expect(toPartChange('decision', values, { goal: 'G1' })).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      owner: 'Ada',
      date: '2026-10-04',
    })
  })

  it('gives a Decision the Goal that the person picked in the place of its Goal', () => {
    expect(toPartChange('decision', values, { goal: 'G2' })).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
      owner: 'Ada',
      date: '2026-10-04',
      goal: 'G1',
    })
  })

  it('gives no other type a Goal', () => {
    expect(toPartChange('flow', values, { goal: null })).toEqual({
      title: 'Show the video of the creator',
      body: 'It follows #I3.',
    })
  })

  it('expects the values that the person saw', () => {
    expect(toExpectedPart(decision)).toEqual({
      title: 'The Concept lives in the database',
      body: 'It follows #I3 and #D9.',
      owner: 'Ada',
      date: '2026-01-15',
    })
  })
})
