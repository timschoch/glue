import type { Page } from 'playwright'

export type Role = Parameters<Page['getByRole']>[0]

/** What a bot does on a screen. Targets are found by accessible role and name. */
export type Action =
  /**
   * Types into the control labelled `label`. `{email}` and `{password}` become the
   * bot's own, `{remark}` its survey Remark.
   */
  | { kind: 'fill'; label: string | RegExp; value: string }
  | { kind: 'click'; role: Role; name: string | RegExp }
  /** Picks one of the choices on the screen: radios, options or buttons in a group. */
  | { kind: 'choose' }
  /**
   * Answers the radio group named `question` for itself. Its radios run from low to
   * high. `experience`: the bot's own experience. `seq`: its SEQ score, 1 to 7.
   */
  | { kind: 'answer'; question: string | RegExp; from: 'experience' | 'seq' }

/** One intent of a person, for example "import a recipe". */
export type Step = {
  intent: string
  actions: Array<Action>
  /**
   * The bot does this step only when the screen shows it, for example the
   * closest plan when no plan fits. Else it goes on with the next step.
   */
  optional?: boolean
}

export type Journey = { product: string; steps: Array<Step> }

/** The questions a step answers. Their radio groups are no choices that add struggle. */
export function listQuestions(step: Step): Array<string | RegExp> {
  return step.actions.flatMap((action) =>
    action.kind === 'answer' ? [action.question] : [],
  )
}
