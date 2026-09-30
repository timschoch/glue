import { describe, expect, it } from 'vitest'
import { pickChoice } from './default-effect.ts'
import { createRandom } from '../bot.ts'
import type { Bot } from '../bot.ts'

const bot: Bot = {
  patience: 0.5,
  experience: 0.5,
  device: 'desktop',
  hour: 12,
}
const DRAWS = 2000

function countPicks(choices: number, preselected: number | null, seed: number) {
  const random = createRandom(seed)
  const counts = Array<number>(choices).fill(0)
  for (let draw = 0; draw < DRAWS; draw++) {
    counts[pickChoice({ choices, preselected }, bot, random)]++
  }
  return counts
}

describe('default effect', () => {
  it('picks a preselected choice more often than the others', () => {
    const counts = countPicks(4, 2, 3)
    const others = counts.filter((_, index) => index !== 2)
    // Without the effect each of 4 choices gets about a quarter.
    expect(counts[2]).toBeGreaterThan(DRAWS / 2)
    for (const count of others) expect(counts[2]).toBeGreaterThan(count * 3)
  })

  it('spreads the picks when nothing is preselected', () => {
    const counts = countPicks(4, null, 3)
    for (const count of counts) {
      expect(count).toBeGreaterThan(DRAWS * 0.2)
      expect(count).toBeLessThan(DRAWS * 0.3)
    }
  })

  it('sticks less on an experienced bot', () => {
    const random = createRandom(5)
    const expert = { ...bot, experience: 1 }
    const novice = { ...bot, experience: 0 }
    let expertStays = 0
    let noviceStays = 0
    for (let draw = 0; draw < DRAWS; draw++) {
      if (pickChoice({ choices: 4, preselected: 0 }, expert, random) === 0)
        expertStays++
      if (pickChoice({ choices: 4, preselected: 0 }, novice, random) === 0)
        noviceStays++
    }
    expect(expertStays).toBeLessThan(noviceStays)
  })

  it('repeats exactly with the same seed', () => {
    expect(countPicks(5, 1, 9)).toEqual(countPicks(5, 1, 9))
  })
})
