import type { PartType } from './schema.ts'

// A Kind lists the slots a Concept must fill: one slot per Part type.
// The check `concepts_kind_check` holds the same Kinds.
export const kinds = {
  // A Brief wants the why (Insight, Goal, Decision, Metric) and what a
  // coding agent reads (Flow, Entity, Guardrail).
  brief: {
    slots: [
      'insight',
      'goal',
      'decision',
      'metric',
      'flow',
      'entity',
      'guardrail',
    ],
  },
} as const satisfies Record<string, { slots: ReadonlyArray<PartType> }>

export type Kind = keyof typeof kinds
