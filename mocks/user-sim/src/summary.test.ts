import { describe, expect, it } from 'vitest'
import { toSummary } from './summary.ts'

describe('toSummary', () => {
  it('counts each ending on the step it happened in', () => {
    const summary = toSummary(
      ['sign up', 'import a recipe', 'accept a plan'],
      [
        { end: 'finished', step: 2 },
        { end: 'left', step: 1 },
        { end: 'missing', step: 1 },
        { end: 'error', step: 1 },
        { end: 'error', step: 0 },
        { end: 'missing', step: 0 },
      ],
    )

    expect(summary).toEqual({
      users: 6,
      steps: [
        { intent: 'sign up', reached: 5, missing: 1, errors: 1 },
        { intent: 'import a recipe', reached: 3, missing: 1, errors: 1 },
        { intent: 'accept a plan', reached: 1, missing: 0, errors: 0 },
      ],
      finished: 1,
      survey: { answers: 0, mean: null, remarks: 0 },
    })
  })

  it('counts the survey answers of finished bots, their mean and remarks', () => {
    const summary = toSummary(
      ['answer the survey'],
      [
        { end: 'finished', step: 0, answer: { score: 3, remark: 'Hard' } },
        { end: 'finished', step: 0, answer: { score: 6, remark: '' } },
        { end: 'left', step: 0 },
      ],
    )

    expect(summary.survey).toEqual({ answers: 2, mean: 4.5, remarks: 1 })
  })
})
