import type { Decision } from '../db/concept.ts'
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
  partCount: 2,
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
    concept: home.slug,
    conceptTitle: home.title,
  }
}

function rootOf(project: { slug: string; name: string }): ConceptNode {
  return {
    slug: project.slug,
    title: project.name,
    kind: null,
    partCount: 1,
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

// The Parts of Glue, in the order of the read model.
export const parts = [insight, goal, accepted, guardrail]

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
    supersededBy: null,
    supersedes: [],
    needs: toEnds(needs, 1),
    neededBy: toEnds(neededBy, 10),
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

// D4 in the model before the Part model: the Decision form reads it.
export const decision: Decision = {
  kind: 'decision',
  id: 'D4',
  title: 'The Concept lives in the database',
  date: '2026-01-15',
  owner: 'Ada',
  status: 'accepted',
  body: '',
  goal: { id: 'G1', title: 'Agents build from the Concept' },
  evidence: [{ id: 'R1', title: 'No query over 200ms' }],
  supersededBy: null,
  supersedes: [],
  issueUrl: null,
}
