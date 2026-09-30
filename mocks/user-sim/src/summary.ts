import type { Answer } from './survey.ts'

/**
 * How a bot's visit ended, and on which step (index into the journey):
 * - finished: it did the last step
 * - left: it found the step and chose to leave
 * - missing: it did not find the step
 * - error: an action on the step failed or timed out, or the product rate-limited
 *   the bot
 */
export type Outcome = {
  end: 'finished' | 'left' | 'missing' | 'error'
  step: number
  /** The bot's survey answer, when the journey has a survey and it answered. */
  answer?: Answer
}

export type StepCount = {
  intent: string
  /** Bots that found the step on the screen. */
  reached: number
  /** Bots that left because they did not find the step. */
  missing: number
  /** Bots whose action on the step failed. */
  errors: number
}

export type Summary = {
  users: number
  steps: Array<StepCount>
  /** Bots that walked the whole journey. */
  finished: number
  survey: {
    answers: number
    /** SEQ mean, null without answers. */
    mean: number | null
    remarks: number
  }
}

export function toSummary(
  intents: Array<string>,
  outcomes: Array<Outcome>,
): Summary {
  const count = (test: (outcome: Outcome) => boolean) =>
    outcomes.filter(test).length
  const answers = outcomes.flatMap((outcome) =>
    outcome.end === 'finished' && outcome.answer ? [outcome.answer] : [],
  )
  return {
    users: outcomes.length,
    steps: intents.map((intent, index) => ({
      intent,
      reached: count(
        (outcome) =>
          outcome.step > index ||
          (outcome.step === index && outcome.end !== 'missing'),
      ),
      missing: count(
        (outcome) => outcome.end === 'missing' && outcome.step === index,
      ),
      errors: count(
        (outcome) => outcome.end === 'error' && outcome.step === index,
      ),
    })),
    finished: count((outcome) => outcome.end === 'finished'),
    survey: {
      answers: answers.length,
      mean:
        answers.length === 0
          ? null
          : answers.reduce((sum, answer) => sum + answer.score, 0) /
            answers.length,
      remarks: answers.filter((answer) => answer.remark !== '').length,
    },
  }
}
