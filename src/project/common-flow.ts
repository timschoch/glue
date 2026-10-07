import type { AskStep } from '../db/asks.ts'
import type { Build } from '../db/builds.ts'
import type { ContractState } from '../db/contracts.ts'
import type {
  Answer,
  Concept,
  Part,
  PartSummary,
  PartType,
} from '../db/parts.ts'
import { canRaiseToPattern } from '../evidence-level.ts'
import type { LevelSignal } from '../evidence-level.ts'

// The common flows of docs/concept.md, section 7: which one a Part or a
// Concept is in, the step it is at, and the one next step.

// The one next step: an answer of the owner, the step of a Hunch to
// Pattern, the test that confirms a Pattern, a new Part that needs
// this one, the home Concept, the Joint to the Insight that an Ask handed back, the Part
// where the loop goes on, or the build in GitHub. It is never an answer
// that breaks the Part (glue/D58). A Concept has two more: its sign-off, and
// the Contract Version to build from.
export type NextStep =
  | { kind: 'answer'; answer: Answer }
  // `needsSource`: the Signals do not agree, so the member names the second
  // source that agrees.
  | { kind: 'raise'; label: string; needsSource: boolean }
  | { kind: 'verify'; label: string }
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
  use: { name: 'Use to Insight', steps: ['Read'] },
  change: { name: 'React to a change', steps: ['Check', 'Answer'] },
  ask: { name: 'Ask another Project', steps: ['Ask', 'Pick', 'Hand back'] },
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
// The Signals agree (glue/D54, glue/D60). Glue proposes, the member decides.
const raiseToPattern: NextStep = {
  kind: 'raise',
  label: 'Raise to Pattern',
  needsSource: false,
}
// An Insight that a member wrote has no Signals that agree: the member
// names the second source that agrees (glue/D60).
const raiseWithSource: NextStep = { ...raiseToPattern, needsSource: true }
// A test confirms a Pattern: the member says what was tested (glue/D60).
const verify: NextStep = { kind: 'verify', label: 'Verify' }
// No Contract exists yet, so each Concept waits for its sign-off.
const openConcept: NextStep = { kind: 'concept', label: 'Open Concept' }

// The step after each Evidence level. An Insight with no level is a hunch.
const evidenceSteps = { hunch: 1, pattern: 2, confirmed: 3 }

// The Parts of one of the types that need the Part and are not sunk.
function listNeeding(part: Part, ...types: Array<PartType>) {
  return part.neededBy
    .map(({ part: needing }) => needing)
    .filter(
      ({ type, workState }) => types.includes(type) && workState !== 'sunk',
    )
}

// The Use flow: a member reads the Metric against its target, and the
// reading becomes an Insight that needs the Part. With such an Insight the
// flow goes on at it until it is published. Then there is no step left.
function readInsight(part: Part): CommonFlow {
  const insights = listNeeding(part, 'insight')
  if (insights.length === 0) {
    return { ...flows.use, current: 0, next: addInsight }
  }
  const draft = insights.find(({ workState }) => workState !== 'published')
  return { ...flows.use, current: 1, next: draft && openPart(draft) }
}

// The flow of a Decision whose build shipped (glue/D64): the Use flow, with
// a Metric of its own or of a Goal that it needs. With no Metric the step
// adds one.
function findShippedFlow(part: Part): CommonFlow {
  const hasMetric = [...part.measured, ...part.goalMetrics].some(
    ({ workState }) => workState !== 'sunk',
  )
  return hasMetric
    ? readInsight(part)
    : { ...flows.use, current: 0, next: addPart('metric') }
}

// The flow of a published Part, by its type. A flow that ended because a
// Part needs this one goes on at the first such Part that needs work: one
// that is not published, or a Decision that is not built. `built` are the
// ids of the built Decisions. With no such Part there is no step left.
function findPublishedFlow(
  part: Part,
  built: ReadonlyArray<string>,
): CommonFlow {
  const openNeeding = (needing: ReadonlyArray<PartSummary>) => {
    const open = needing.find(
      ({ id, type, workState }) =>
        workState !== 'published' ||
        (type === 'decision' && !built.includes(id)),
    )
    return open && openPart(open)
  }

  switch (part.type) {
    case 'insight': {
      const level = part.evidenceLevel ?? 'hunch'
      const current = evidenceSteps[level]
      // Signals that agree need no second source: see findCommonFlow.
      if (level === 'hunch') {
        return { ...flows.evidence, current, next: raiseWithSource }
      }
      if (level === 'pattern') {
        return { ...flows.evidence, current, next: verify }
      }
      const decisions = listNeeding(part, 'decision')
      const next = decisions.length > 0 ? openNeeding(decisions) : addDecision
      return { ...flows.evidence, current, next }
    }
    case 'goal': {
      const decisions = listNeeding(part, 'decision')
      if (decisions.length === 0) {
        return { ...flows.decision, current: 1, next: addDecision }
      }
      // A reading against the target of the Goal becomes an Insight.
      return part.measure?.latestValue == null
        ? { ...flows.decision, current: 3, next: openNeeding(decisions) }
        : readInsight(part)
    }
    case 'decision':
      return listNeeding(part, 'flow', 'entity').length > 0
        ? { ...flows.brief, current: 1, next: openConcept }
        : { ...flows.brief, current: 0, next: addPart('flow') }
    case 'metric':
      return readInsight(part)
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

function findNewest<TBuild extends GatedBuild>(
  builds: ReadonlyArray<TBuild>,
): TBuild {
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
// build names a Contract Version, then a gate checks it. When the gate
// holds, the build shipped: the Use flow starts.
function findBuildFlow(
  part: Part,
  builds: ReadonlyArray<GatedBuild>,
): CommonFlow {
  if (isBuilt(builds)) return findShippedFlow(part)
  const newest = findNewest(builds)
  const current = newest.gate ? 2 : newest.contract ? 1 : 0
  return { ...flows.build, current, next: openBuild(newest) }
}

// A build that names a Contract Version of a Concept, with the Decisions
// that it names.
export type ConceptBuild = GatedBuild & Pick<Build, 'decisions'>

// The Parts of a Concept and their Joints.
type ConceptParts = Pick<Concept, 'parts' | 'linkedParts' | 'joints'>

// The first of the Decisions with its home in the Concept that no Insight
// needs. A sunk Insight does not count.
function findUnread(
  concept: ConceptParts,
  decisions: ReadonlyArray<PartSummary>,
): PartSummary | undefined {
  const insights = [...concept.parts, ...concept.linkedParts]
    .filter(({ type, workState }) => type === 'insight' && workState !== 'sunk')
    .map(({ id }) => id)
  const read = concept.joints
    .filter(({ part }) => insights.includes(part))
    .map(({ needs }) => needs)
  return decisions.find(
    ({ id }) =>
      !read.includes(id) && concept.parts.some((part) => part.id === id),
  )
}

// The common flow of a Concept (glue/D58): it fills the slots that its Kind
// requires, its owner signs it off as a Contract Version, a build names that
// Version, and the gate of the build holds. `builds` are the builds that name a
// Contract Version of the Concept. A Concept that is ahead of its Contract
// is at the sign-off again. A Part without Trust solid blocks the sign-off:
// the step opens the first one. A build that shipped hands over to the Use
// flow (glue/D64): the step opens the first Decision of `concept` that the
// build names and that no Insight needs.
export function findConceptFlow(
  contract: ContractState,
  builds: ReadonlyArray<ConceptBuild> = [],
  concept?: ConceptParts,
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
  if (build.gate?.result !== 'holds') {
    return { ...flows.concept, current: 3, next: openBuild(build) }
  }
  const unread = concept && findUnread(concept, build.decisions)
  return unread
    ? { ...flows.use, current: 0, next: openPart(unread) }
    : { ...flows.concept, current: 4, next: undefined }
}

// The common flow that fits the type and the state of the Part. A flag
// comes before the flow of the type. A build that names a published Part
// comes before the flow of its type. A sunk Part is in no flow. `ask` is the
// step of the open Ask of the Part: the Part shows the steps of the Ask and
// keeps the next step of its own flow, until the Insight is handed back.
// Then the next step glues it. `signals` are the Signals of the Part: a
// Hunch is raised to Pattern with no second source when they agree, see
// canRaiseToPattern. `built` are the ids of the Decisions that need the
// Part and are built.
export function findCommonFlow(
  part: Part,
  builds: ReadonlyArray<GatedBuild> = [],
  ask?: AskStep,
  signals: ReadonlyArray<LevelSignal> = [],
  built: ReadonlyArray<string> = [],
): CommonFlow | undefined {
  const own = findOwnFlow(part, builds, built)
  const flagged = part.workState === 'to-check' || part.workState === 'waiting'
  const agreed =
    part.type === 'insight' &&
    (part.evidenceLevel ?? 'hunch') === 'hunch' &&
    canRaiseToPattern(signals)
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
  // A Decision on a Hunch goes on at the Hunch (glue/D60): the step opens
  // the first Insight that it needs, so the member can raise it. A draft
  // and a Decision in review take no sign-off before.
  const hunch =
    part.evidenceBase === 'hunch'
      ? part.needs.find(({ part: needed }) => needed.type === 'insight')
      : undefined
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
    case 'review': {
      const next = hunch ? openPart(hunch.part) : signOff
      return { ...draftFlows[part.type], next }
    }
    case 'published': {
      const flow =
        builds.length > 0
          ? findBuildFlow(part, builds)
          : findPublishedFlow(part, built)
      return hunch ? { ...flow, next: openPart(hunch.part) } : flow
    }
  }
}
