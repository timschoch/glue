import type { Build } from '../db/builds.ts'
import type { Contract, ContractState } from '../db/contracts.ts'
import type { LeveledPart } from '../db/flight-level.ts'
import type { People } from '../db/members.ts'
import type {
  Concept,
  ConceptNode,
  Part,
  PartSummary,
  Project,
} from '../db/parts.ts'

// A Project for the tests of the routes: Glue with the Concept `Part model`,
// and the Concept `Read model` in it.

export const projects = [
  { slug: 'flexibeck', name: 'flexibeck' },
  { slug: 'glue', name: 'Glue' },
]

const readModel: ConceptNode = {
  slug: 'read-model',
  title: 'Read model',
  kind: null,
  partCount: 1,
  concepts: [],
}

const partModel: ConceptNode = {
  slug: 'part-model',
  title: 'Part model',
  kind: 'brief',
  partCount: 3,
  concepts: [readModel],
}

const flows: ConceptNode = {
  slug: 'flows',
  title: 'Flows',
  kind: null,
  partCount: 0,
  concepts: [],
}

function summary(
  id: string,
  type: PartSummary['type'],
  title: string,
  home: ConceptNode,
  status: string | null = null,
): PartSummary {
  return {
    id,
    type,
    title,
    status,
    trust: 'solid',
    workState: 'published',
    concept: home.slug,
    conceptTitle: home.title,
  }
}

function rootOf(project: { slug: string; name: string }): ConceptNode {
  return {
    slug: project.slug,
    title: project.name,
    kind: null,
    partCount: project.slug === 'glue' ? 4 : 0,
    concepts: project.slug === 'glue' ? [partModel, flows] : [],
  }
}

const glue = rootOf(projects[1])

const goal = summary('G1', 'goal', 'Agents build from the Concept', glue)
const insight = summary('I3', 'insight', 'Agents read files', partModel)
const accepted = summary(
  'D4',
  'decision',
  'The Concept lives in the database',
  partModel,
  'accepted',
)
const guardrail = summary('R1', 'guardrail', 'No query over 200ms', readModel)

// The Parts of Glue, in the order of the read model, as Ada sees them: her
// loop step is Decide.
export const parts: LeveledPart[] = [
  { ...insight, flightLevel: 'strategic' },
  { ...goal, flightLevel: 'operational' },
  { ...accepted, flightLevel: 'operational' },
  { ...guardrail, flightLevel: 'strategic' },
]

// The builds of Glue: one names the Decision D4 and its gate holds, one names
// an old Contract Version of the Part model and its gate breaks.
export const builds: Build[] = [
  {
    number: 12,
    url: 'https://github.com/timschoch/glue/pull/12',
    title: 'Read the Concept from the database',
    state: 'open',
    decisions: [accepted],
    contract: null,
    stale: false,
    gate: {
      result: 'holds',
      reasons: [],
      checkedAt: '2026-10-05T09:00:00.000Z',
    },
  },
  {
    number: 11,
    url: 'https://github.com/timschoch/glue/pull/11',
    title: 'Add the Part tables',
    state: 'merged',
    decisions: [],
    contract: {
      concept: partModel.slug,
      title: partModel.title,
      version: 1,
      newestVersion: 2,
    },
    stale: true,
    gate: {
      result: 'breaks',
      reasons: [
        'Contract "part-model@1" is not the newest Version. Build with "part-model@2": `pnpm concept contract show part-model`.',
      ],
      checkedAt: '2026-10-05T09:00:00.000Z',
    },
  },
]

// The people of Glue. Ada reads: she is Responsible of D4. Bo is Co-Author
// of the Concept `Part model` and watches D4.
export const people: People = {
  members: [
    {
      id: 1,
      userId: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      loopSteps: ['decide'],
    },
    {
      id: 2,
      userId: 'user-2',
      name: 'Bo',
      email: 'bo@example.com',
      loopSteps: ['build', 'use'],
    },
  ],
  assignments: [
    { id: 1, memberId: 1, role: 'responsible', concept: null, part: 'D4' },
    {
      id: 2,
      memberId: 2,
      role: 'co-author',
      concept: 'part-model',
      part: null,
    },
  ],
  watchers: [{ memberId: 2, part: 'D4' }],
  me: 1,
}

export function findProject(slug: string): Project | undefined {
  const project = projects.find((known) => known.slug === slug)
  return project && { ...project, concept: rootOf(project) }
}

function findNode(node: ConceptNode, slug: string): ConceptNode | undefined {
  if (node.slug === slug) return node
  for (const child of node.concepts) {
    const found = findNode(child, slug)
    if (found) return found
  }
  return undefined
}

export function findConcept({
  project,
  concept,
}: {
  project: string
  concept: string
}): Concept | undefined {
  const root = findProject(project)?.concept
  const node = root && findNode(root, concept)
  if (!node) return undefined
  const here = project === 'glue' ? parts : []

  return {
    slug: node.slug,
    title: node.title,
    kind: node.kind,
    path: [],
    concepts: node.concepts,
    parts: here.filter(({ concept: home }) => home === node.slug),
    // The Decision of the Part model needs the Goal of Glue.
    linkedParts: node === partModel ? [goal] : [],
    joints: [],
    slots:
      node.kind === 'brief'
        ? [
            { type: 'insight', filled: true },
            { type: 'goal', filled: true },
            { type: 'decision', filled: true },
            { type: 'metric', filled: false },
          ]
        : [],
  }
}

function part(
  found: PartSummary,
  needs: Array<PartSummary>,
  neededBy: Array<PartSummary>,
): Part {
  const toEnds = (ends: Array<PartSummary>, first: number) =>
    ends.map((end, index) => ({
      jointId: first + index,
      twoWay: false,
      link: end.concept !== found.concept,
      contractVersion: null,
      part: end,
    }))

  return {
    ...found,
    body: found === accepted ? 'It follows #I3 and #D9.' : '',
    owner: null,
    date: null,
    source: null,
    metric: null,
    enforcedBy: null,
    evidenceLevel: null,
    issueUrl: null,
    measure: null,
    measured: [],
    supersededBy: null,
    supersedes: [],
    needs: toEnds(needs, 1),
    neededBy: toEnds(neededBy, 10),
    flags: [],
    waitsOn: null,
    signals: [],
    answers: ['not-ready', 'sink'],
    activity: [{ kind: 'published', at: '2026-10-02T08:00:00.000Z' }],
    question: null,
    unchosen: false,
  }
}

// The Decision needs the Goal and the Insight. The Guardrail needs the
// Decision.
const records = [
  part(goal, [], [accepted]),
  part(insight, [], [accepted]),
  part(accepted, [goal, insight], [guardrail]),
  part(guardrail, [accepted], []),
]

export function findPart({
  project,
  recordId,
}: {
  project: string
  recordId: string
}): Part | undefined {
  return project === 'glue'
    ? records.find((record) => record.id === recordId)
    : undefined
}

type ConceptInput = { project: string; concept: string }

const signed = {
  version: 1,
  checksum: '9f2c4e7a1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd',
  signedBy: 'Ada',
  signedAt: '2026-10-01T10:00:00.000Z',
}

// The Part model has one Contract Version and is ahead of it. No other
// Concept has a Version.
export function findContractState(
  input: ConceptInput,
): ContractState | undefined {
  if (!findConcept(input)) return undefined
  return input.concept === partModel.slug
    ? { versions: [signed], ahead: true, blocking: [] }
    : { versions: [], ahead: false, blocking: [] }
}

export function findContract({
  concept,
  version = signed.version,
}: ConceptInput & { version?: number }): Contract | undefined {
  if (concept !== partModel.slug || version !== signed.version) return undefined
  const frozen = records
    .filter((record) => record.concept === partModel.slug)
    .map((record) => ({ ...record, needs: [] }))

  return {
    ...signed,
    concept: partModel.slug,
    title: partModel.title,
    kind: partModel.kind,
    newestVersion: signed.version,
    tier1: [],
    tier2: frozen,
    slots: findConcept({ project: 'glue', concept })?.slots ?? [],
  }
}
