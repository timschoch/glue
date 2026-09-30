import { describe, expect, it } from 'vitest'
import { effortLeaveChance } from './effort.ts'
import type { Bot } from '../bot.ts'

const bot: Bot = {
  patience: 0.5,
  experience: 0.5,
  device: 'desktop',
  hour: 12,
}
const light = { textLength: 200, requiredInputs: 1 }

describe('effort and text load', () => {
  it('raises the leave chance with longer text', () => {
    expect(
      effortLeaveChance({ ...light, textLength: 4000 }, bot),
    ).toBeGreaterThan(effortLeaveChance(light, bot))
  })

  it('raises the leave chance with more required inputs', () => {
    expect(
      effortLeaveChance({ ...light, requiredInputs: 8 }, bot),
    ).toBeGreaterThan(effortLeaveChance(light, bot))
  })

  it('weighs less on a patient bot', () => {
    const heavy = { textLength: 4000, requiredInputs: 8 }
    expect(effortLeaveChance(heavy, { ...bot, patience: 1 })).toBeLessThan(
      effortLeaveChance(heavy, { ...bot, patience: 0 }),
    )
  })

  it('weighs more on a small screen', () => {
    expect(
      effortLeaveChance(light, { ...bot, device: 'mobile' }),
    ).toBeGreaterThan(effortLeaveChance(light, bot))
  })

  it('stays below certainty on a very heavy screen', () => {
    const extreme = { textLength: 100_000, requiredInputs: 100 }
    expect(effortLeaveChance(extreme, { ...bot, patience: 0 })).toBeLessThan(1)
  })
})
