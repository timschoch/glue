import type { Answer, Part, PartType } from '../db/parts.ts'

// The common flows of docs/concept.md, section 7: which one a Part is in,
// the step it is at, and the one next step.

// The one next step: an answer of the owner, the form of the Part, a new
// Part that needs this one, or the home Concept.
export type NextStep =
  | { kind: 'answer'; answer: Answer }
  | { kind: 'edit'; label: string }
  | { kind: 'add'; type: PartType; label: string }
  | { kind: 'concept'; label: string }

export type CommonFlow = {
  name: string
  steps: ReadonlyArray<string>
  // The position of the current step. The count of the steps: all are done.
  current: number
  // undefined: the flow asks nothing of this Part now.
  next?: NextStep
}

const flows = {
  evidence: {
    name: 'Evidence to Insight',
    steps: ['Group', 'Check', 'Verify'],
  },
  decision: {
    name: 'Insight to Decision',
    steps: ['Set Goal', 'Choose', 'Sign'],
  },
  brief: { name: 'Decision to Brief', steps: ['Fill slots', 'Sign'] },
  use: { name: 'Use to Insight', steps: ['Measure', 'Read'] },
  change: { name: 'React to a change', steps: ['Check', 'Answer'] },
} as const

const signOff: NextStep = { kind: 'answer', answer: 'supersede' }
const addDecision: NextStep = {
  kind: 'add',
  type: 'decision',
  label: 'Add Decision',
}
// No Contract exists yet, so each Concept waits for its sign-off.
const openConcept: NextStep = { kind: 'concept', label: 'Open Concept' }

// The step after each Evidence level. An Insight with no level is a hunch.
const evidenceSteps = { hunch: 1, pattern: 2, confirmed: 3 }

// The flow of a published Part, by its type.
function findPublishedFlow(part: Part): CommonFlow {
  // A Part of one of the types needs this Part and is not sunk.
  const isNeededBy = (...types: Array<PartType>) =>
    part.neededBy.some(
      ({ part: needing }) =>
        types.includes(needing.type) && needing.workState !== 'sunk',
    )

  switch (part.type) {
    case 'insight': {
      const current = evidenceSteps[part.evidenceLevel ?? 'hunch']
      if (current < flows.evidence.steps.length) {
        const next = { kind: 'edit', label: 'Raise the level' } as const
        return { ...flows.evidence, current, next }
      }
      const next = isNeededBy('decision') ? undefined : addDecision
      return { ...flows.evidence, current, next }
    }
    case 'goal':
      return isNeededBy('decision')
        ? { ...flows.decision, current: 3, next: undefined }
        : { ...flows.decision, current: 1, next: addDecision }
    case 'decision':
      return isNeededBy('flow', 'entity')
        ? { ...flows.brief, current: 1, next: openConcept }
        : {
            ...flows.brief,
            current: 0,
            next: { kind: 'add', type: 'flow', label: 'Add Flow' },
          }
    case 'metric':
      return {
        ...flows.use,
        current: 1,
        next: isNeededBy('insight')
          ? undefined
          : { kind: 'add', type: 'insight', label: 'Add Insight' },
      }
    default:
      return { ...flows.brief, current: 1, next: openConcept }
  }
}

// The step that a draft or a Part in review is at: its sign-off.
const draftFlows: Record<PartType, Omit<CommonFlow, 'next'>> = {
  insight: { ...flows.evidence, current: 0 },
  goal: { ...flows.decision, current: 0 },
  decision: { ...flows.decision, current: 2 },
  guardrail: { ...flows.brief, current: 0 },
  entity: { ...flows.brief, current: 0 },
  flow: { ...flows.brief, current: 0 },
  metric: { ...flows.use, current: 0 },
}

// The common flow that fits the type and the state of the Part. A flag
// comes before the flow of the type. A sunk Part is in no flow.
export function findCommonFlow(part: Part): CommonFlow | undefined {
  switch (part.workState) {
    case 'sunk':
      return undefined
    case 'to-check':
      return {
        ...flows.change,
        current: 0,
        next: { kind: 'answer', answer: 'fine' },
      }
    case 'waiting':
      return { ...flows.change, current: 1, next: undefined }
    case 'draft':
    case 'review':
      return { ...draftFlows[part.type], next: signOff }
    case 'published':
      return findPublishedFlow(part)
  }
}
