import { describe, expect, it } from 'vitest'
import { choiceOverloadLeaveChance } from './choice-overload.ts'
import type { Bot } from '../bot.ts'

const bot: Bot = {
  patience: 0.5,
  experience: 0.5,
  device: 'desktop',
  hour: 12,
}

describe('choice overload', () => {
  it('raises the leave chance with more choices', () => {
    expect(choiceOverloadLeaveChance(12, bot)).toBeGreaterThan(
      choiceOverloadLeaveChance(3, bot),
    )
  })

  it('does not apply to a screen with one choice or none', () => {
    expect(choiceOverloadLeaveChance(0, bot)).toBe(0)
    expect(choiceOverloadLeaveChance(1, bot)).toBe(0)
  })

  it('weighs less on an experienced bot', () => {
    const expert = { ...bot, experience: 1 }
    expect(choiceOverloadLeaveChance(12, expert)).toBeLessThan(
      choiceOverloadLeaveChance(12, bot),
    )
  })
})
