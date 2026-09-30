import type { Bot } from '../bot.ts'

// Choice overload. Sources:
// - Iyengar, S. S. and Lepper, M. R. (2000). When choice is demotivating: Can one
//   desire too much of a good thing? Journal of Personality and Social Psychology,
//   79(6), 995-1006. 24 jams drew more people than 6, but far fewer bought.
// - Scheibehenne, B., Greifeneder, R. and Todd, P. M. (2010). Can there ever be too
//   many options? A meta-analytic review of choice overload. Journal of Consumer
//   Research, 37(3), 409-425. The mean effect is close to zero and varies a lot.
// - Chernev, A., Böckenholt, U. and Goodman, J. (2015). Choice overload: A conceptual
//   review and meta-analysis. Journal of Consumer Psychology, 25(2), 333-358. The
//   effect is real when the set is complex, the task hard and the preference unclear.
// - Chernev, A. (2003). When more is less and less is more: The role of ideal point
//   availability and assortment in consumer choice. Journal of Consumer Research,
//   30(2), 170-183. People who know what they want suffer less from large sets.
// - Hick, W. E. (1952). On the rate of gain of information. Quarterly Journal of
//   Experimental Psychology, 4(1), 11-26. Decision time grows with log2(n + 1).
//
// Assumption: Hick's law measures decision time, not leaving. That the leave chance
// grows with log2(n + 1), and the size of LEAVE_PER_BIT, are this model's own.

/** Leave chance per bit of decision load (Hick) above a single choice. An assumption. */
const LEAVE_PER_BIT = 0.08
/** How much full experience cuts the load (Chernev). */
const EXPERIENCE_RELIEF = 0.5
/** How much full patience cuts the load. */
const PATIENCE_RELIEF = 0.5

export function choiceOverloadLeaveChance(choices: number, bot: Bot): number {
  if (choices <= 1) return 0
  const bits = Math.log2(choices + 1) - 1
  return (
    LEAVE_PER_BIT *
    bits *
    (1 - EXPERIENCE_RELIEF * bot.experience) *
    (1 - PATIENCE_RELIEF * bot.patience)
  )
}
