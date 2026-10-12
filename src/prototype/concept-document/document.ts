import type { ProjectBuilds } from '../../db/builds.ts'
import type { Concept, MeasuredPart, PartType } from '../../db/parts.ts'
import type { Reading, Trust } from '../../design-system/card.tsx'
import { toReading } from '../../project/part-views.ts'

// PROTOTYPE, throwaway (design-system/D16). A Concept as one document: its
// fixed areas in loop order, and the lines of reasoning that run through
// them. The three variants draw this one shape.

export const steps = ['Understand', 'Decide', 'Design', 'Build', 'Use'] as const

export type Step = (typeof steps)[number]

// A build is no Part: it comes from GitHub. It has its own area.
export type AreaType = PartType | 'build'

// The fixed areas of each Concept, in the order of the loop.
const areaForms = [
  { type: 'insight', step: 'Understand', name: 'Insights', single: 'Insight' },
  { type: 'goal', step: 'Decide', name: 'Goal', single: 'Goal' },
  { type: 'decision', step: 'Decide', name: 'Decisions', single: 'Decision' },
  {
    type: 'guardrail',
    step: 'Decide',
    name: 'Guardrails',
    single: 'Guardrail',
  },
  { type: 'flow', step: 'Design', name: 'Flows', single: 'Flow' },
  { type: 'entity', step: 'Design', name: 'Entities', single: 'Entity' },
  { type: 'build', step: 'Build', name: 'Builds', single: 'Build' },
  { type: 'metric', step: 'Use', name: 'Metric', single: 'Metric' },
] as const satisfies ReadonlyArray<{
  type: AreaType
  step: Step
  name: string
  single: string
}>

// One record of an area: a Part or a build.
export type Entry = {
  // The record id, or the number of the build.
  id: string
  type: AreaType
  title: string
  // A build has no Trust.
  trust?: Trust
  // The ids of the entries that it needs.
  needs: ReadonlyArray<string>
  // Only a Metric has one.
  reading?: Reading
  href: string
}

export type Area = (typeof areaForms)[number] & {
  entries: ReadonlyArray<Entry>
}

// One line of reasoning: a Decision with its evidence, what it designs and
// what builds it. An empty list is a gap.
export type Thread = {
  decision: Entry
  evidence: ReadonlyArray<Entry>
  design: ReadonlyArray<Entry>
  builds: ReadonlyArray<Entry>
}

// The threads that serve one Goal, and the Metrics that measure it. A
// Concept with no Goal has one group with none.
export type ThreadGroup = {
  goal?: Entry
  metrics: ReadonlyArray<Entry>
  threads: ReadonlyArray<Thread>
}

// The one next step: the first empty area in loop order. With no empty
// area: an Insight from the reading that misses its target.
export type NextStep = { step: Step; area: AreaType; label: string }

export type ConceptDocumentShape = {
  title: string
  areas: ReadonlyArray<Area>
  groups: ReadonlyArray<ThreadGroup>
  // Each loop step with the count of its entries.
  stepCounts: ReadonlyArray<{ step: Step; count: number }>
  next?: NextStep
}

export function toConceptDocument(
  concept: Concept,
  builds: ProjectBuilds | undefined,
  measured: ReadonlyArray<MeasuredPart>,
): ConceptDocumentShape {
  const listNeeds = (id: string) =>
    concept.joints.filter(({ part }) => part === id).map(({ needs }) => needs)
  const entries: Array<Entry> = [
    ...[...concept.parts, ...concept.linkedParts].map((part) => {
      const measure = measured.find(({ id }) => id === part.id)?.measure
      return {
        id: part.id,
        type: part.type,
        title: part.title,
        trust: part.trust,
        needs: listNeeds(part.id),
        reading: measure ? toReading(measure) : undefined,
        // A stub: the prototype opens no record.
        href: `#${part.id}`,
      }
    }),
    ...(builds?.builds ?? []).map((build) => ({
      id: `#${build.number}`,
      type: 'build' as const,
      title: build.title,
      needs: build.decisions.map(({ id }) => id),
      href: build.url,
    })),
  ]
  const ofType = (...types: Array<AreaType>) =>
    entries.filter(({ type }) => types.includes(type))
  const areas = areaForms.map((form) => ({
    ...form,
    entries: ofType(form.type),
  }))

  const toThread = (decision: Entry): Thread => ({
    decision,
    evidence: ofType('insight', 'guardrail').filter(({ id }) =>
      decision.needs.includes(id),
    ),
    design: ofType('flow', 'entity').filter(({ needs }) =>
      needs.includes(decision.id),
    ),
    builds: ofType('build').filter(({ needs }) => needs.includes(decision.id)),
  })
  const goals = ofType('goal')
  const decisions = ofType('decision')
  const groups: Array<ThreadGroup> =
    goals.length > 0
      ? goals.map((goal) => ({
          goal,
          metrics: ofType('metric').filter(({ needs }) =>
            needs.includes(goal.id),
          ),
          threads: decisions
            .filter(({ needs }) => needs.includes(goal.id))
            .map(toThread),
        }))
      : [{ metrics: ofType('metric'), threads: decisions.map(toThread) }]

  const empty = areas.find((area) => area.entries.length === 0)
  const missed = ofType('metric').some(
    ({ reading }) => reading?.onTarget === false,
  )

  return {
    title: concept.title,
    areas,
    groups,
    stepCounts: steps.map((step) => ({
      step,
      count: areas
        .filter((area) => area.step === step)
        .reduce((count, area) => count + area.entries.length, 0),
    })),
    next: empty
      ? { step: empty.step, area: empty.type, label: `Add ${empty.single}` }
      : missed
        ? { step: 'Use', area: 'metric', label: 'Add Insight' }
        : undefined,
  }
}
