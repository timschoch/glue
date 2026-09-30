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
})
