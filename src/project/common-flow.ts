import type { AskStep } from '../db/asks.ts'
import type { Build } from '../db/builds.ts'
import type { ContractState } from '../db/contracts.ts'
import type { Answer, Part, PartSummary, PartType } from '../db/parts.ts'

// The common flows of docs/concept.md, section 7: which one a Part or a
// Concept is in, the step it is at, and the one next step.

// The one next step: an answer of the owner, the form of the Part, a higher
// Evidence level that Glue proposes, a new Part that needs this one, the
// home Concept, the Joint to the Insight that an Ask handed back, the Part
// where the loop goes on, or the build in GitHub. It is never an answer
// that breaks the Part (glue/D58). A Concept has two more: its sign-off, and
// the Contract Version to build from.
export type NextStep =
  | { kind: 'answer'; answer: Answer }
  | { kind: 'edit'; label: string }
  | { kind: 'raise'; level: 'pattern'; label: string }
  | { kind: 'add'; type: PartType; label: string }
  | { kind: 'concept'; label: string }
  | { kind: 'glue'; label: string }
  | { kind: 'open'; part: { id: string; concept: string }; label: string }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'sign'; label: string }
  | { kind: 'version'; version: number; label: string }

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
  concept: {
    name: 'Concept to build',
    steps: ['Fill slots', 'Sign', 'Build', 'Gate'],
  },
} as const

// The step that an open Ask is at. `check`: all the steps are done.
const askSteps: Record<AskStep, number> = { pick: 1, 'hand-back': 2, check: 3 }

const checkAndGlue: NextStep = { kind: 'glue', label: 'Check and glue' }

const signOff: NextStep = { kind: 'answer', answer: 'supersede' }

// A new Part of the type. The name of a Part type is one word.
function addPart(type: PartType): NextStep {
  const name = `${type.charAt(0).toUpperCase()}${type.slice(1)}`
  return { kind: 'add', type, label: `Add ${name}` }
}
const addDecision = addPart('decision')
const addInsight = addPart('insight')

// The loop goes on at another Part: the step opens it.
function openPart({ id, concept, title }: PartSummary): NextStep {
  return { kind: 'open', part: { id, concept }, label: `Open ${id} ${title}` }
}
// Several sources agree (glue/D54). Glue proposes, the member decides.
const raiseToPattern: NextStep = {
  kind: 'raise',
  level: 'pattern',
  label: 'Raise to Pattern',
}
const PATTERN_SOURCES = 2
// No Contract exists yet, so each Concept waits for its sign-off.
const openConcept: NextStep = { kind: 'concept', label: 'Open Concept' }

// The step after each Evidence level. An Insight with no level is a hunch.
const evidenceSteps = { hunch: 1, pattern: 2, confirmed: 3 }

// The flow of a published Part, by its type. A flow that ended because a
// Part needs this one goes on at the first such Part that needs work: one
// that is not published, or a Decision that is not built. `built` are the
// ids of the built Decisions. With no such Part there is no step left.
function findPublishedFlow(
  part: Part,
  built: ReadonlyArray<string>,
): CommonFlow {
  // The Parts of one of the types that need this Part and are not sunk.
  const listNeeding = (...types: Array<PartType>) =>
    part.neededBy
      .map(({ part: needing }) => needing)
      .filter(
        ({ type, workState }) => types.includes(type) && workState !== 'sunk',
      )
  const openNeeding = (needing: ReadonlyArray<PartSummary>) => {
    const open = needing.find(
      ({ id, type, workState }) =>
        workState !== 'published' ||
        (type === 'decision' && !built.includes(id)),
    )
    return open && openPart(open)
  }
  // A reading becomes an Insight.
  const readInsight = () => {
    const insights = listNeeding('insight')
    return insights.length > 0
      ? { ...flows.use, current: 2, next: openNeeding(insights) }
      : { ...flows.use, current: 1, next: addInsight }
  }

  switch (part.type) {
    case 'insight': {
      const current = evidenceSteps[part.evidenceLevel ?? 'hunch']
      if (current < flows.evidence.steps.length) {
        const next = { kind: 'edit', label: 'Raise the level' } as const
        return { ...flows.evidence, current, next }
      }
      const decisions = listNeeding('decision')
      const next = decisions.length > 0 ? openNeeding(decisions) : addDecision
      return { ...flows.evidence, current, next }
    }
    case 'goal': {
      const decisions = listNeeding('decision')
      if (decisions.length === 0) {
        return { ...flows.decision, current: 1, next: addDecision }
      }
      // A reading against the target of the Goal becomes an Insight.
      return part.measure?.latestValue == null
        ? { ...flows.decision, current: 3, next: openNeeding(decisions) }
        : readInsight()
    }
    case 'decision':
      return listNeeding('flow', 'entity').length > 0
        ? { ...flows.brief, current: 1, next: openConcept }
        : { ...flows.brief, current: 0, next: addPart('flow') }
    case 'metric':
      return readInsight()
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

// A build that names the Part or the Contract, with the Contract Version
// that it names and the newest result of its gate.
export type GatedBuild = Pick<Build, 'number' | 'url' | 'contract' | 'gate'>

function findNewest(builds: ReadonlyArray<GatedBuild>): GatedBuild {
  return builds.reduce((found, build) =>
    build.number > found.number ? build : found,
  )
}

// A Part is built when the gate of the newest build that names it holds.
export function isBuilt(builds: ReadonlyArray<GatedBuild>): boolean {
  return builds.length > 0 && findNewest(builds).gate?.result === 'holds'
}

// The build is in GitHub: the step opens it there.
function openBuild({ number, url }: GatedBuild): NextStep {
  return { kind: 'link', href: url, label: `Open build ${number}` }
}

// The flow of a published Part that builds name, by its newest build. The
// build names a Contract Version, then a gate checks it. The flow ends when
// the gate holds.
function findBuildFlow(builds: ReadonlyArray<GatedBuild>): CommonFlow {
  if (isBuilt(builds)) return { ...flows.build, current: 3, next: undefined }
  const newest = findNewest(builds)
  const current = newest.gate ? 2 : newest.contract ? 1 : 0
  return { ...flows.build, current, next: openBuild(newest) }
}

// The common flow of a Concept (glue/D58): it fills the slots that its Kind
// requires, its owner signs it off as a Contract Version, a build names that
// Version, and the gate of the build holds. `builds` are the builds that name a
// Contract Version of the Concept. A Concept that is ahead of its Contract
// is at the sign-off again. A Part without Trust solid blocks the sign-off:
// the step opens the first one.
export function findConceptFlow(
  contract: ContractState,
  builds: ReadonlyArray<GatedBuild> = [],
): CommonFlow {
  const empty = contract.emptySlots.at(0)
  if (empty) return { ...flows.concept, current: 0, next: addPart(empty.type) }

  const newest = contract.versions.at(0)
  if (!newest || contract.ahead) {
    const blocking = contract.blocking.at(0)
    const next: NextStep = blocking
      ? openPart(blocking)
      : { kind: 'sign', label: 'Sign off' }
    return { ...flows.concept, current: 1, next }
  }

  const { version } = newest
  const named = builds.filter((build) => build.contract?.version === version)
  if (named.length === 0) {
    const label = `Open Version ${version}`
    const next: NextStep = { kind: 'version', version, label }
    return { ...flows.concept, current: 2, next }
  }
  const build = findNewest(named)
  return build.gate?.result === 'holds'
    ? { ...flows.concept, current: 4, next: undefined }
    : { ...flows.concept, current: 3, next: openBuild(build) }
}

// The common flow that fits the type and the state of the Part. A flag
// comes before the flow of the type. A build that names a published Part
// comes before the flow of its type. A sunk Part is in no flow. `ask` is the
// step of the open Ask of the Part: the Part shows the steps of the Ask and
// keeps the next step of its own flow, until the Insight is handed back.
// Then the next step glues it. `signalSources` are the sources that gave
// the Signals of the Part: the next step of a Hunch with two or more is to
// raise it to Pattern. `built` are the ids of the Decisions that need the
// Part and are built.
export function findCommonFlow(
  part: Part,
  builds: ReadonlyArray<GatedBuild> = [],
  ask?: AskStep,
  signalSources: ReadonlyArray<string> = [],
  built: ReadonlyArray<string> = [],
): CommonFlow | undefined {
  const own = findOwnFlow(part, builds, built)
  const flagged = part.workState === 'to-check' || part.workState === 'waiting'
  const agreed =
    part.type === 'insight' &&
    (part.evidenceLevel ?? 'hunch') === 'hunch' &&
    new Set(signalSources).size >= PATTERN_SOURCES
  const flow =
    own && agreed && !flagged ? { ...own, next: raiseToPattern } : own
  if (!flow || !ask || flagged) return flow
  const next = ask === 'check' ? checkAndGlue : flow.next
  return { ...flows.ask, current: askSteps[ask], next }
}

function findOwnFlow(
  part: Part,
  builds: ReadonlyArray<GatedBuild>,
  built: ReadonlyArray<string>,
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
    // The answer comes when the awaited Part changes: the step opens it.
    case 'waiting':
      return {
        ...flows.change,
        current: 1,
        next: part.waitsOn ? openPart(part.waitsOn) : undefined,
      }
    case 'draft':
    case 'review':
      return { ...draftFlows[part.type], next: signOff }
    case 'published':
      return builds.length > 0
        ? findBuildFlow(builds)
        : findPublishedFlow(part, built)
  }
}
