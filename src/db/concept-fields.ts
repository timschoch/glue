// Concept record types: Part type and required fields per folder.
// The one home of these shapes; concept-records.ts validates against them.
import type { PartType } from './schema.ts'

export type { DecisionStatus, GoalStatus, InsightStatus } from './schema.ts'

type FolderFields = { type: PartType | null; required: readonly string[] }

// Fact is no longer a type (D26). Its folder stays empty until the screens
// and the HTTP API drop it.
export const CONCEPT_FIELDS = {
  goals: { type: 'goal', required: ['id', 'title', 'metric', 'source'] },
  decisions: {
    type: 'decision',
    required: ['id', 'title', 'date', 'owner', 'status', 'goal', 'evidence'],
  },
  insights: { type: 'insight', required: ['id', 'title', 'date', 'source'] },
  facts: { type: null, required: ['id', 'title', 'source'] },
  guardrails: { type: 'guardrail', required: ['id', 'title', 'enforced_by'] },
} as const satisfies Record<string, FolderFields>
