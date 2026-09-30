/**
 * How a bot's visit ended, and on which step (index into the journey):
 * - finished: it did the last step
 * - left: it found the step and chose to leave
 * - missing: it did not find the step
 * - error: an action on the step failed or timed out
 */
export type Outcome = {
  end: 'finished' | 'left' | 'missing' | 'error'
  step: number
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
}

export function toSummary(
  intents: Array<string>,
  outcomes: Array<Outcome>,
): Summary {
  const count = (test: (outcome: Outcome) => boolean) =>
    outcomes.filter(test).length
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
  }
}
