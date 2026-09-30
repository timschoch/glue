import type { Bot } from '../bot.ts'

// Worked example effect. Sources:
// - Sweller, J. and Cooper, G. A. (1985). The use of worked examples as a substitute
//   for problem solving in learning algebra. Cognition and Instruction, 2(1), 59-89.
//   Novices learn a procedure faster from a worked example than by trying it alone.
// - Renkl, A. (2014). Toward an instructionally oriented theory of example-based
//   learning. Cognitive Science, 38(1), 1-37. Examples help novices most. For
//   experts the gain goes away (expertise reversal effect).
//
// Assumption: the sources measure learning, not leaving. That a technique without a
// demo raises the leave chance of a novice, and the sizes of the constants below,
// are this model's own.

/** A step a novice cannot do from its name alone. The pattern finds its word forms. */
export type Technique = { name: string; pattern: RegExp }

const TECHNIQUES: Array<Technique> = [
  { name: 'stretch and fold', pattern: /\bstretch(?:es)? and folds?\b/i },
  { name: 'lamination', pattern: /\blaminat(?:e|es|ed|ing|ion)\b/i },
  { name: 'shaping', pattern: /\b(?:pre-?)?shap(?:e|es|ed|ing)\b/i },
]

/** Leave chance per technique without a demo, for a full novice. */
const LEAVE_PER_TECHNIQUE = 0.1
/** A screen full of techniques still keeps some novices. */
const MAX_LEAVE_CHANCE = 0.8

/** The techniques a text names. */
export function listTechniques(text: string): Array<Technique> {
  return TECHNIQUES.filter((technique) => technique.pattern.test(text))
}

/** Full experience removes the effect (expertise reversal). */
export function workedExampleLeaveChance(
  techniquesWithoutDemo: number,
  bot: Bot,
): number {
  return Math.min(
    MAX_LEAVE_CHANCE,
    LEAVE_PER_TECHNIQUE * techniquesWithoutDemo * (1 - bot.experience),
  )
}
