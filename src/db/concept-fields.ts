// Concept record types: id prefix and required fields per folder.
// The one home of these shapes; concept-records.ts validates against them.
export type { DecisionStatus, GoalStatus, InsightStatus } from './schema.ts'

export const CONCEPT_FIELDS = {
  goals: { prefix: 'G', required: ['id', 'title', 'metric', 'source'] },
  decisions: {
    prefix: 'D',
    required: ['id', 'title', 'date', 'owner', 'status', 'goal', 'evidence'],
  },
  insights: { prefix: 'I', required: ['id', 'title', 'date', 'source'] },
  facts: { prefix: 'F', required: ['id', 'title', 'source'] },
  guardrails: { prefix: 'R', required: ['id', 'title', 'enforced_by'] },
} as const
