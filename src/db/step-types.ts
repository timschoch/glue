import type { LoopStep, PartType } from './schema.ts'

// The Part types of each loop step: the Parts that its section lists. The
// table in docs/concept.md, "3. Part types", names the steps of each type.
export const stepTypes = {
  understand: ['insight'],
  decide: ['goal', 'decision', 'guardrail', 'flow', 'metric'],
  design: ['guardrail', 'entity', 'flow'],
  build: ['guardrail', 'entity'],
  use: ['metric'],
} as const satisfies Record<LoopStep, ReadonlyArray<PartType>>
