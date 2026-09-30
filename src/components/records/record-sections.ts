import type { LinkedRecord } from '../../db/concept.ts'

// The section of the overview that shows each kind of record.
export const recordSections = {
  goal: { id: 'goals', name: 'Goals' },
  decision: { id: 'decisions', name: 'Decisions' },
  guardrail: { id: 'guardrails', name: 'Guardrails' },
  insight: { id: 'insights', name: 'Insights' },
  fact: { id: 'facts', name: 'Facts' },
} as const satisfies Record<LinkedRecord['kind'], { id: string; name: string }>

// The id of the heading of the page of a record. The focus goes there after
// an action on the page, because the button of the action is gone then, and
// after the save of a new Decision.
export const recordTitleId = 'record-title'

// The id of the name of the Insights. The focus goes there after the triage
// of the last draft, from the overview and from the page of the draft.
export const insightsNameId = `${recordSections.insight.id}-name`
