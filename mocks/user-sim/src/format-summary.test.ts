import { describe, expect, it } from 'vitest'
import { formatSummary } from './format-summary.ts'

describe('formatSummary', () => {
  it('lists how many bots reached each step', () => {
    const text = formatSummary({
      users: 10,
      steps: [
        { intent: 'sign up', reached: 10, missing: 0, errors: 0 },
        { intent: 'import a recipe', reached: 7, missing: 1, errors: 2 },
      ],
      finished: 5,
      survey: { answers: 0, mean: null, remarks: 0 },
    })
    expect(text).toBe(
      [
        'step             reached  not found  error',
        'sign up               10          0      0',
        'import a recipe        7          1      2',
        'finished               5 of 10',
      ].join('\n'),
    )
  })

  it('adds the survey mean when bots answered it', () => {
    const text = formatSummary({
      users: 10,
      steps: [
        { intent: 'answer the survey', reached: 4, missing: 0, errors: 0 },
      ],
      finished: 3,
      survey: { answers: 3, mean: 4.333, remarks: 1 },
    })
    expect(text.split('\n').at(-1)).toBe(
      'survey: answers 3, SEQ mean 4.33, remarks 1',
    )
  })
})
