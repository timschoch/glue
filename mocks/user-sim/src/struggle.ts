import type { Bot } from './bot.ts'
import type { Screen } from './screen.ts'
import { choiceOverloadLeaveChance } from './rules/choice-overload.ts'
import { effortLeaveChance } from './rules/effort.ts'
import { workedExampleLeaveChance } from './rules/worked-example.ts'

/** The Rules that make a Bot struggle. */
export const REASONS = ['choice-overload', 'effort', 'worked-example'] as const

export type Reason = (typeof REASONS)[number]

/** Per Reason, the chance to leave that a Bot faced on a screen or a whole walk. */
export type Struggle = Record<Reason, number>

export const NO_STRUGGLE: Struggle = {
  'choice-overload': 0,
  effort: 0,
  'worked-example': 0,
}

export function getStruggle(screen: Screen, bot: Bot): Struggle {
  return {
    // Each choice set is a decision of its own, so their chances combine.
    'choice-overload': screen.choiceSets.reduce(
      (overload, set) =>
        eitherChance(overload, choiceOverloadLeaveChance(set.choices, bot)),
      0,
    ),
    effort: effortLeaveChance(screen, bot),
    'worked-example': workedExampleLeaveChance(
      screen.techniquesWithoutDemo,
      bot,
    ),
  }
}

/** Independent reasons to leave: 1 - (1 - a)(1 - b)... */
export function toLeaveChance(struggle: Struggle): number {
  return Object.values(struggle).reduce(eitherChance, 0)
}

/** The struggle of a walk so far plus one more screen, per Reason. */
export function addStruggle(walk: Struggle, screen: Struggle): Struggle {
  return {
    'choice-overload': eitherChance(
      walk['choice-overload'],
      screen['choice-overload'],
    ),
    effort: eitherChance(walk.effort, screen.effort),
    'worked-example': eitherChance(
      walk['worked-example'],
      screen['worked-example'],
    ),
  }
}

/** The chance that one or both of two independent events happen. */
function eitherChance(first: number, second: number): number {
  return 1 - (1 - first) * (1 - second)
}
