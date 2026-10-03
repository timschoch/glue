import { describe, expect, it } from 'vitest'

import { isRecordId, sortById, typeOfRecordId } from './record-id.ts'

describe('isRecordId', () => {
  it.each(['I1', 'G2', 'D12', 'R3', 'E4', 'F5', 'M6'])(
    'takes the id %s: the letter of a Part type and a number',
    (id) => {
      expect(isRecordId(id)).toBe(true)
    },
  )

  it.each(['X1', 'D', 'd1', 'D1a', 'DD1', '12', ''])(
    'refuses "%s"',
    (value) => {
      expect(isRecordId(value)).toBe(false)
    },
  )
})

describe('typeOfRecordId', () => {
  it.each([
    ['I1', 'insight'],
    ['G2', 'goal'],
    ['D12', 'decision'],
    ['R3', 'guardrail'],
    ['E4', 'entity'],
    ['F5', 'flow'],
    ['M6', 'metric'],
  ])('reads from %s the type %s', (id, type) => {
    expect(typeOfRecordId(id)).toBe(type)
  })

  it('finds no type in a text that is not a record id', () => {
    expect(typeOfRecordId('X1')).toBeUndefined()
    expect(typeOfRecordId('Goal')).toBeUndefined()
  })
})

describe('sortById', () => {
  it('sorts by the number of the id, not by its text', () => {
    const sorted = sortById([{ id: 'D10' }, { id: 'D2' }, { id: 'D1' }])

    expect(sorted.map(({ id }) => id)).toEqual(['D1', 'D2', 'D10'])
  })
})
