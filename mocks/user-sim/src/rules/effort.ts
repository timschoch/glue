import type { Bot } from '../bot.ts'

// Effort and text load. Sources:
// - Nielsen, J. (2008). How little do users read? Nielsen Norman Group. Users read
//   about 20% of the words on an average page; more text adds load, not reading.
// - Baymard Institute, checkout usability research. A long or complicated form is
//   one of the top reasons to abandon; each required field adds friction.
// - Nielsen, J. (2011). Mobile content is twice as difficult. Nielsen Norman Group.
//   Comprehension drops on small screens.
//
// Assumption: Nielsen 2008 and 2011 measure reading and understanding, not leaving.
// That text length and required inputs raise the leave chance, and the sizes of the
// constants below, are this model's own.

export type Load = {
  /** Visible characters on the screen. */
  textLength: number
  requiredInputs: number
}

/** Leave chance per 1000 visible characters. */
const LEAVE_PER_THOUSAND_CHARACTERS = 0.03
/** Leave chance per required input. */
const LEAVE_PER_REQUIRED_INPUT = 0.02
/** How much full patience cuts the load. */
const PATIENCE_RELIEF = 0.6
/** Extra load on a small screen (Nielsen 2011). */
const MOBILE_FACTOR = 1.4
/** A heavy screen still keeps some bots. */
const MAX_LEAVE_CHANCE = 0.8

export function effortLeaveChance(load: Load, bot: Bot): number {
  const raw =
    (load.textLength / 1000) * LEAVE_PER_THOUSAND_CHARACTERS +
    load.requiredInputs * LEAVE_PER_REQUIRED_INPUT
  const device = bot.device === 'mobile' ? MOBILE_FACTOR : 1
  return Math.min(
    MAX_LEAVE_CHANCE,
    raw * device * (1 - PATIENCE_RELIEF * bot.patience),
  )
}
