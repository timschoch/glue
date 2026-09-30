import type { Bot, Random } from '../bot.ts'

// Default effect. Sources:
// - Johnson, E. J. and Goldstein, D. (2003). Do defaults save lives? Science,
//   302(5649), 1338-1339. Opt-out countries reach far higher organ donor rates.
// - McKenzie, C. R. M., Liersch, M. J. and Finkelstein, S. R. (2006). Recommendations
//   implicit in policy defaults. Psychological Science, 17(5), 414-420. People read
//   a default as a recommendation, most of all when they know little themselves.

/** Chance a bot keeps the preselected choice. */
const STAY_CHANCE = 0.7
/** How much full experience cuts the stay chance (McKenzie et al.). */
const EXPERIENCE_RELIEF = 0.4

export type ChoiceSet = {
  choices: number
  /** Index of the preselected choice, or null. */
  preselected: number | null
}

/** Returns the index of the choice the bot picks. */
export function getChoice(set: ChoiceSet, bot: Bot, random: Random): number {
  const stayChance = STAY_CHANCE * (1 - EXPERIENCE_RELIEF * bot.experience)
  const stay = random() < stayChance
  if (set.preselected !== null && stay) return set.preselected
  return Math.floor(random() * set.choices)
}
