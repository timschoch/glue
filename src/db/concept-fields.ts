// Concept record types: id prefix and required fields per folder.
// See concept/README.md for the record shapes. Kept in sync with
// scripts/check-concept.mjs by hand until concept/ is removed.
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
