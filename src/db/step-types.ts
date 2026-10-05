import type { LoopStep, PartType } from './schema.ts'

// The Part types of each loop step: the Parts that its section lists.
export const stepTypes = {
  understand: ['insight'],
  decide: ['goal', 'decision'],
  design: ['flow', 'entity'],
  build: ['guardrail'],
  use: ['metric'],
} as const satisfies Record<LoopStep, ReadonlyArray<PartType>>
