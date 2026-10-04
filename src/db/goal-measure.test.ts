import { describe, expect, it } from 'vitest'

import { isOnTarget, toTarget } from './goal-measure.ts'
import type { FunnelMeasure, MeanMeasure } from './goal-measure.ts'

const funnel: FunnelMeasure = {
  kind: 'funnel',
  source: 'mock-analytics',
  steps: ['signed-up', 'paid'],
  target: 0.25,
  window_days: 7,
}

const mean: MeanMeasure = {
  kind: 'mean',
  source: 'mock-analytics',
  event: 'survey sent',
  property: '$survey_response',
  target_change: 1,
  window_days: 7,
}

describe('toTarget', () => {
  it('gives the target of a funnel', () => {
    expect(toTarget(funnel, null)).toBe(0.25)
  })

  it('gives the baseline of a mean with its target change', () => {
    expect(toTarget(mean, 4)).toBe(5)
    expect(toTarget({ ...mean, target_change: -0.5 }, 4)).toBe(3.5)
  })

  it('gives no target for a mean without a baseline', () => {
    expect(toTarget(mean, null)).toBeNull()
  })
})

describe('isOnTarget', () => {
  it('holds for a funnel that reaches its target', () => {
    expect(isOnTarget(funnel, null, 0.25)).toBe(true)
    expect(isOnTarget(funnel, null, 0.1)).toBe(false)
  })

  it('holds for a mean that moved by its target change', () => {
    expect(isOnTarget(mean, 4, 5)).toBe(true)
    expect(isOnTarget(mean, 4, 4.5)).toBe(false)
  })

  it('holds for a target below the baseline only when the mean went down', () => {
    const down = { ...mean, target_change: -0.5 }
    expect(isOnTarget(down, 4, 3.5)).toBe(true)
    expect(isOnTarget(down, 4, 5)).toBe(false)
  })

  it('does not hold for a mean without a baseline', () => {
    expect(isOnTarget(mean, null, 5)).toBe(false)
  })
})
