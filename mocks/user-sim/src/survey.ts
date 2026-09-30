import type { Random } from './bot.ts'
import { REASONS, toLeaveChance } from './struggle.ts'
import type { Reason, Struggle } from './struggle.ts'

// Single Ease Question (SEQ): "How easy was the task?", 1 very hard to 7 very easy.
// Source: Sauro, J. and Dumas, J. S. (2009). Comparison of three one-question,
// post-task usability questionnaires. CHI 2009, 1599-1608.
//
// Assumption: the bot scores from the struggle of its walk, the chance to leave it
// faced from all Rules together. The linear scale and the noise are this model's
// own. Comments are scripted per Reason, which the Owner allows for the role play
// (Insight I21).

export type Answer = {
  /** SEQ score, 1 very hard to 7 very easy. */
  score: number
  /** Empty when the bot writes none. */
  comment: string
}

const LOWEST_SCORE = 1
const HIGHEST_SCORE = 7
/** People answering the same walk differ by up to half a point either way. */
const NOISE = 0.5

export const COMMENTS: Record<Reason, Array<string>> = {
  'choice-overload': [
    'Too many options to pick from',
    'I could not tell the options apart',
  ],
  effort: ['Too much to read and fill in', 'The forms took too long'],
  'worked-example': [
    'A video of each step would help',
    'I did not know how to do some of the steps',
  ],
}

/**
 * The bot's answer to the SEQ after its walk. It writes a comment with a chance as
 * high as its struggle, about the Reason it struggled with most.
 */
export function getAnswer(struggle: Struggle, random: Random): Answer {
  const difficulty = toLeaveChance(struggle)
  const raw =
    HIGHEST_SCORE -
    (HIGHEST_SCORE - LOWEST_SCORE) * difficulty +
    (random() * 2 - 1) * NOISE
  const score = Math.min(HIGHEST_SCORE, Math.max(LOWEST_SCORE, Math.round(raw)))
  if (random() >= difficulty) return { score, comment: '' }
  const reason = REASONS.reduce((most, next) =>
    struggle[next] > struggle[most] ? next : most,
  )
  const comments = COMMENTS[reason]
  return { score, comment: comments[Math.floor(random() * comments.length)] }
}
