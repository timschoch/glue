import type { Page } from 'playwright'

export type Role = Parameters<Page['getByRole']>[0]

/** What a bot does on a screen. Targets are found by accessible role and name. */
export type Action =
  /** Types into the control labelled `label`. `{email}` and `{password}` become the bot's own. */
  | { kind: 'fill'; label: string | RegExp; value: string }
  | { kind: 'click'; role: Role; name: string | RegExp }
  /** Picks one of the choices on the screen: radios, options or buttons in a group. */
  | { kind: 'choose' }

/** One intent of a person, for example "import a recipe". */
export type Step = { intent: string; actions: Array<Action> }

export type Journey = { product: string; steps: Array<Step> }
