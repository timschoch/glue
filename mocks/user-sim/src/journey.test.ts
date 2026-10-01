import { describe, expect, it } from 'vitest'
import { listQuestions } from './journey.ts'

describe('listQuestions', () => {
  it('lists the questions a step answers, and nothing else', () => {
    expect(
      listQuestions({
        intent: 'answer the survey',
        actions: [
          { kind: 'answer', question: /how easy/i, from: 'seq' },
          { kind: 'fill', label: /what was hard/i, value: '{remark}' },
          { kind: 'click', role: 'button', name: 'Send answer' },
        ],
      }),
    ).toEqual([/how easy/i])
  })

  it('lists nothing for a step without questions', () => {
    expect(
      listQuestions({
        intent: 'start',
        actions: [{ kind: 'click', role: 'link', name: 'Start' }],
      }),
    ).toEqual([])
  })
})
