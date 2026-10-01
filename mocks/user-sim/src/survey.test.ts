import { describe, expect, it } from 'vitest'
import { createRandom } from './bot.ts'
import { REMARKS, getAnswer } from './survey.ts'
import { NO_STRUGGLE } from './struggle.ts'

const SAMPLES = 200

function listAnswers(struggle: typeof NO_STRUGGLE) {
  const random = createRandom(1)
  return Array.from({ length: SAMPLES }, () => getAnswer(struggle, random))
}

function getMean(scores: Array<number>): number {
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

describe('survey answer', () => {
  it('scores the SEQ from 1 to 7', () => {
    for (const answer of listAnswers({
      ...NO_STRUGGLE,
      effort: 0.5,
    })) {
      expect(Number.isInteger(answer.score)).toBe(true)
      expect(answer.score).toBeGreaterThanOrEqual(1)
      expect(answer.score).toBeLessThanOrEqual(7)
    }
  })

  it('scores a walk without struggle as very easy, without a remark', () => {
    for (const answer of listAnswers(NO_STRUGGLE)) {
      expect(answer).toEqual({ score: 7, remark: '' })
    }
  })

  it('scores lower after more struggle', () => {
    const light = listAnswers({ ...NO_STRUGGLE, effort: 0.2 })
    const heavy = listAnswers({ ...NO_STRUGGLE, effort: 0.8 })
    expect(getMean(heavy.map((answer) => answer.score))).toBeLessThan(
      getMean(light.map((answer) => answer.score)),
    )
  })

  it('remarks on the reason it struggled most with', () => {
    const answers = listAnswers({
      'choice-overload': 0.1,
      effort: 0.2,
      'worked-example': 0.6,
    })
    const remarks = answers
      .map((answer) => answer.remark)
      .filter((remark) => remark !== '')
    expect(remarks.length).toBeGreaterThan(0)
    expect(remarks.length).toBeLessThan(SAMPLES)
    for (const remark of remarks) {
      expect(REMARKS['worked-example']).toContain(remark)
    }
  })

  it('repeats exactly with the same seed', () => {
    const struggle = { ...NO_STRUGGLE, 'worked-example': 0.5 }
    expect(listAnswers(struggle)).toEqual(listAnswers(struggle))
  })
})
