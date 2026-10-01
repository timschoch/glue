import { describe, expect, it } from 'vitest'
import {
  NO_STRUGGLE,
  addStruggle,
  getStruggle,
  toLeaveChance,
} from './struggle.ts'
import type { Bot } from './bot.ts'

const novice: Bot = {
  patience: 0,
  experience: 0,
  device: 'desktop',
  hour: 12,
}
const plainScreen = {
  choiceSets: [],
  requiredInputs: 0,
  textLength: 0,
  techniquesWithoutDemo: 0,
}

describe('struggle', () => {
  it('is none on a plain screen', () => {
    expect(getStruggle(plainScreen, novice)).toEqual(NO_STRUGGLE)
    expect(toLeaveChance(NO_STRUGGLE)).toBe(0)
  })

  it('reads each rule as its own reason', () => {
    const struggle = getStruggle(
      {
        choiceSets: [{ choices: 12, preselected: null }],
        requiredInputs: 2,
        textLength: 0,
        techniquesWithoutDemo: 1,
      },
      novice,
    )
    expect(struggle['choice-overload']).toBeGreaterThan(0)
    expect(struggle.effort).toBeGreaterThan(0)
    expect(struggle['worked-example']).toBeGreaterThan(0)
  })

  it('combines reasons as independent leave chances', () => {
    const struggle = {
      'choice-overload': 0.5,
      effort: 0.5,
      'worked-example': 0,
    }
    expect(toLeaveChance(struggle)).toBeCloseTo(0.75)
  })

  it('adds up over a walk, per reason', () => {
    const step = { 'choice-overload': 0.5, effort: 0, 'worked-example': 0.2 }
    expect(addStruggle(step, step)).toEqual({
      'choice-overload': 0.75,
      effort: 0,
      'worked-example': expect.closeTo(0.36),
    })
  })
})
