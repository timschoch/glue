import { describe, expect, it } from 'vitest'
import { listTechniques, workedExampleLeaveChance } from './worked-example.ts'
import type { Bot } from '../bot.ts'

const novice: Bot = {
  patience: 0.5,
  experience: 0,
  device: 'desktop',
  hour: 12,
}

describe('worked example effect', () => {
  it('raises the leave chance of a novice for a technique without a demo', () => {
    expect(workedExampleLeaveChance(1, novice)).toBeGreaterThan(0)
  })

  it('raises the leave chance with more techniques without a demo', () => {
    expect(workedExampleLeaveChance(2, novice)).toBeGreaterThan(
      workedExampleLeaveChance(1, novice),
    )
  })

  it('does not apply when every technique has a demo', () => {
    expect(workedExampleLeaveChance(0, novice)).toBe(0)
  })

  it('does not apply to an expert (expertise reversal)', () => {
    expect(workedExampleLeaveChance(3, { ...novice, experience: 1 })).toBe(0)
  })

  it('weighs less on a more experienced bot', () => {
    expect(
      workedExampleLeaveChance(1, { ...novice, experience: 0.5 }),
    ).toBeLessThan(workedExampleLeaveChance(1, novice))
  })

  it('stays below certainty with many techniques', () => {
    expect(workedExampleLeaveChance(100, novice)).toBeLessThan(1)
  })
})

describe('listTechniques', () => {
  const listNames = (text: string) =>
    listTechniques(text).map((technique) => technique.name)

  it('finds the techniques a text names', () => {
    expect(listNames('Next: Stretch and fold. Then Shape, then bake.')).toEqual(
      ['stretch and fold', 'shaping'],
    )
  })

  it('finds lamination and pre-shaping in other word forms', () => {
    expect(listNames('Laminate the dough, then pre-shape it')).toEqual([
      'lamination',
      'shaping',
    ])
  })

  it('finds nothing in a text without techniques', () => {
    expect(listNames('Mix and knead by hand. Rest. Bake.')).toEqual([])
  })
})
