import type { Build, ProjectBuilds } from '../../db/builds.ts'
import type { ContractState } from '../../db/contracts.ts'
import type { LeveledPart } from '../../db/flight-level.ts'
import type {
  Concept,
  ConceptNode,
  MeasuredPart,
  PartSummary,
  Project,
} from '../../db/parts.ts'
import { kinds } from '../../test/project.ts'

// PROTOTYPE, throwaway (design-system/D16). The seed of the prototype
// server: three Concepts of the Project glue with the titles of its real
// records. `Signals and Insights` has many Parts, `Own tools` has few Parts
// and gaps, `Onboarding` is new. The Metric M1 and its reading are made up:
// the Project glue has no Metric yet.

export const projects = [{ slug: 'glue', name: 'Glue' }]

const signals: ConceptNode = {
  slug: 'signals-and-insights',
  title: 'Signals and Insights',
  kind: 'brief',
  partCount: 14,
  concepts: [],
}

const ownTools: ConceptNode = {
  slug: 'own-tools',
  title: 'Own tools',
  kind: 'brief',
  partCount: 7,
  concepts: [],
}

const onboarding: ConceptNode = {
  slug: 'onboarding',
  title: 'Onboarding',
  kind: 'brief',
  partCount: 0,
  concepts: [],
}

const root: ConceptNode = {
  slug: 'glue',
  title: 'Glue',
  kind: null,
  partCount: 21,
  concepts: [signals, ownTools, onboarding],
}

function summary(
  id: string,
  type: PartSummary['type'],
  title: string,
  home: ConceptNode,
): PartSummary {
  return {
    id,
    type,
    title,
    status: type === 'decision' ? 'accepted' : null,
    trust: 'solid',
    workState: 'published',
    concept: home.slug,
    conceptTitle: home.title,
    emptySlots: [],
    reviewNotes: [],
  }
}

const signalParts = [
  summary('I55', 'insight', 'GitHub is a real Integration', signals),
  summary(
    'I103',
    'insight',
    'A member must find repeating Signals by hand',
    signals,
  ),
  summary(
    'I115',
    'insight',
    'Signals have three sources and no filter of the member',
    signals,
  ),
  summary(
    'I117',
    'insight',
    'The flow from evidence to an Insight has no start at the Signals',
    signals,
  ),
  summary(
    'G6',
    'goal',
    'What a team learns from use feeds its next Decisions',
    signals,
  ),
  summary(
    'D30',
    'decision',
    'Signals from outside tools grow into Insights',
    signals,
  ),
  summary(
    'D49',
    'decision',
    'Signals come from support and analytics too',
    signals,
  ),
  summary(
    'D54',
    'decision',
    'Glue proposes a Hunch when Signals repeat',
    signals,
  ),
  summary(
    'D66',
    'decision',
    'Signals come from social media and market analysis too',
    signals,
  ),
  summary(
    'D68',
    'decision',
    'The Signals list shows the flow from evidence to an Insight',
    signals,
  ),
  summary(
    'R5',
    'guardrail',
    'Data stays in the specialist tool that owns it',
    signals,
  ),
  summary('F1', 'flow', 'Evidence to Insight', signals),
  summary('E8', 'entity', 'Signal', signals),
  summary('M1', 'metric', 'Missed readings that become an Insight', signals),
]

const toolParts = [
  summary(
    'I119',
    'insight',
    'A team cannot connect its own tool for Signals',
    ownTools,
  ),
  summary('G7', 'goal', 'A team connects its own tools for Signals', ownTools),
  summary(
    'D70',
    'decision',
    'A member adds an Integration on the Integrations screen',
    ownTools,
  ),
  summary(
    'D72',
    'decision',
    'The first tools are GitHub, PostHog and a webhook',
    ownTools,
  ),
  summary(
    'D73',
    'decision',
    'An Integration shows its last read and why a read failed',
    ownTools,
  ),
  summary(
    'R9',
    'guardrail',
    'A new tool for Signals is one adapter and nothing else',
    ownTools,
  ),
  summary('E12', 'entity', 'Integration', ownTools),
]

export const parts: LeveledPart[] = [...signalParts, ...toolParts].map(
  (part) => ({ ...part, flightLevel: 'strategic' }),
)

// `part` needs `needs`. A Decision needs its evidence and its Goal. A Flow
// and an Entity need their Decisions. A Metric needs the Goal it measures.
const needs: Record<string, ReadonlyArray<string>> = {
  D30: ['I55', 'G6'],
  D49: ['I55', 'R5', 'G6'],
  D54: ['I103', 'G6'],
  D66: ['I115', 'G6'],
  D68: ['I117', 'G6'],
  F1: ['D30', 'D54', 'D68'],
  E8: ['D30', 'D49', 'D66'],
  M1: ['G6'],
  D70: ['I119', 'R9', 'G7'],
  D72: ['I119', 'R9', 'G7'],
  D73: ['I119', 'G7'],
  E12: ['D70', 'D73'],
}

const joints = Object.entries(needs).flatMap(([part, ends]) =>
  ends.map((end) => ({ part, needs: end })),
)

function find(id: string): PartSummary {
  const found = parts.find((part) => part.id === id)
  if (!found) throw new Error(`No Part ${id} in the seed`)
  return found
}

function build(number: number, title: string, decision: string): Build {
  return {
    number,
    url: `https://github.com/timschoch/glue/pull/${number}`,
    title,
    state: 'merged',
    decisions: [find(decision)],
    contract: null,
    stale: false,
    gate: {
      result: 'holds',
      reasons: [],
      guardrails: [],
      checkedAt: '2026-10-10T09:00:00.000Z',
    },
  }
}

const builds: Record<string, Build[]> = {
  [signals.slug]: [
    build(193, 'Show the Signals from GitHub', 'D30'),
    build(288, 'Read Signals from support and analytics', 'D49'),
    build(321, 'Make a Hunch from Signals that repeat', 'D54'),
    build(358, 'Read social and market Signals and save filters', 'D66'),
    build(369, 'Start the flow at the Signals list', 'D68'),
  ],
  [ownTools.slug]: [
    build(397, 'A member adds an Integration with its own key', 'D70'),
    build(400, 'PostHog and a webhook as Integrations', 'D72'),
  ],
}

export function findProject(slug: string): Project | undefined {
  const project = projects.find((known) => known.slug === slug)
  return project && { ...project, concept: root, kinds }
}

export function findConcept({
  project,
  concept,
}: {
  project: string
  concept: string
}): Concept | undefined {
  if (project !== 'glue') return undefined
  const node = [root, ...root.concepts].find(({ slug }) => slug === concept)
  if (!node) return undefined
  const here = parts.filter(({ concept: home }) => home === node.slug)
  const ids = new Set(here.map(({ id }) => id))

  return {
    slug: node.slug,
    title: node.title,
    kind: node.kind,
    path: [],
    concepts: node.concepts,
    parts: here,
    linkedParts: [],
    joints: joints
      .filter(({ part }) => ids.has(part))
      .map((joint, index) => ({
        ...joint,
        id: index + 1,
        twoWay: false,
        link: false,
      })),
    slots: [],
  }
}

// A Concept with a Part has one Contract Version, so the Concept route
// reads its builds.
export function findContractState(input: {
  project: string
  concept: string
}): ContractState | undefined {
  const found = findConcept(input)
  if (!found) return undefined
  return {
    versions:
      found.parts.length > 0
        ? [
            {
              version: 1,
              checksum:
                '9f2c4e7a1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd',
              signedBy: 'Ada',
              signedAt: '2026-10-10T10:00:00.000Z',
            },
          ]
        : [],
    ahead: false,
    blocking: [],
    emptySlots: [],
  }
}

export function findBuilds(concept?: string): ProjectBuilds {
  return { builds: concept ? (builds[concept] ?? []) : [], reason: null }
}

// The reading of M1 misses its target.
export const measured: MeasuredPart[] = [
  {
    ...find('M1'),
    measure: {
      measure: {
        kind: 'funnel',
        source: 'mock-analytics',
        steps: ['reading missed', 'insight added'],
        target: 1,
        window_days: 30,
      },
      baseline: null,
      latestValue: 0.8,
      latestBreakdownValue: null,
      measuredAt: '2026-10-11T06:00:00.000Z',
      target: 1,
      onTarget: false,
    },
  },
]
