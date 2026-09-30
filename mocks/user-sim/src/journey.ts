import type { Page } from 'playwright'

export type Role = Parameters<Page['getByRole']>[0]

/** What a bot does on a screen. Targets are found by accessible role and name. */
export type Action =
  /**
   * Types into the control labelled `label`. `{email}` and `{password}` become the
   * bot's own, `{comment}` its survey comment.
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
export type Step = { intent: string; actions: Array<Action> }

export type Journey = { product: string; steps: Array<Step> }
