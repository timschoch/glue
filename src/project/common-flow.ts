import type { AskStep } from '../db/asks.ts'
import type { Build } from '../db/builds.ts'
import type { Answer, Part, PartType } from '../db/parts.ts'

// The common flows of docs/concept.md, section 7: which one a Part is in,
// the step it is at, and the one next step.

// The one next step: an answer of the owner, the form of the Part, a new
// Part that needs this one, the home Concept, or the Joint to the Insight
// that an Ask handed back.
export type NextStep =
  | { kind: 'answer'; answer: Answer }
  | { kind: 'edit'; label: string }
  | { kind: 'add'; type: PartType; label: string }
  | { kind: 'concept'; label: string }
  | { kind: 'glue'; label: string }

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
  build: { name: 'Brief to build', steps: ['Version', 'Build', 'Gate'] },
  use: { name: 'Use to Insight', steps: ['Measure', 'Read'] },
  change: { name: 'React to a change', steps: ['Check', 'Answer'] },
  ask: { name: 'Ask another team', steps: ['Ask', 'Pick', 'Hand back'] },
} as const

// The step that an open Ask is at. `check`: all the steps are done.
const askSteps: Record<AskStep, number> = { pick: 1, 'hand-back': 2, check: 3 }

const checkAndGlue: NextStep = { kind: 'glue', label: 'Check and glue' }

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

// A build that names the Part, with the newest result of its gate.
export type GatedBuild = Pick<Build, 'number' | 'gate'>

// The flow of a published Part that builds name. It is at the gate until the
// gate of the newest build holds.
function findBuildFlow(builds: ReadonlyArray<GatedBuild>): CommonFlow {
  const newest = builds.reduce((found, build) =>
    build.number > found.number ? build : found,
  )
  const current = newest.gate?.result === 'holds' ? 3 : 2
  return { ...flows.build, current, next: undefined }
}

// The common flow that fits the type and the state of the Part. A flag
// comes before the flow of the type. A build that names a published Part
// comes before the flow of its type. A sunk Part is in no flow. `ask` is the
// step of the open Ask of the Part: the Part shows the steps of the Ask and
// keeps the next step of its own flow, until the Insight is handed back.
// Then the next step glues it.
export function findCommonFlow(
  part: Part,
  builds: ReadonlyArray<GatedBuild> = [],
  ask?: AskStep,
): CommonFlow | undefined {
  const flow = findOwnFlow(part, builds)
  const flagged = part.workState === 'to-check' || part.workState === 'waiting'
  if (!flow || !ask || flagged) return flow
  const next = ask === 'check' ? checkAndGlue : flow.next
  return { ...flows.ask, current: askSteps[ask], next }
}

function findOwnFlow(
  part: Part,
  builds: ReadonlyArray<GatedBuild>,
): CommonFlow | undefined {
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
      return builds.length > 0 ? findBuildFlow(builds) : findPublishedFlow(part)
  }
}
