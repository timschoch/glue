import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { ConceptDb } from './client.ts'
import type { GoalMeasure } from './goal-measure.ts'
import type { Kind } from './kinds.ts'
import type {
  EvidenceLevel,
  FlagReason,
  PartType,
  Trust,
  WorkState,
} from './schema.ts'
import { kinds } from './kinds.ts'
import { sortById } from './record-id.ts'
import * as schema from './schema.ts'

// The read side of the Part model: the shapes of a Project, a Concept and a
// Part as Glue shows them.

// The words of the Part model, for the code outside src/db.
export {
  evidenceLevels,
  flagReasons,
  partTypes,
  trusts,
  workStates,
} from './schema.ts'
export type {
  EvidenceLevel,
  FlagReason,
  PartType,
  Trust,
  WorkState,
} from './schema.ts'

export type PartSummary = {
  // The record id, for example D12.
  id: string
  type: PartType
  title: string
  status: string | null
  trust: Trust
  workState: WorkState
  // The slug of the home Concept.
  concept: string
  conceptTitle: string
}

// An open flag of a Part: the Part that caused it, and why.
export type Flag = {
  cause: { id: string; title: string }
  reason: FlagReason
  createdAt: string
}

export type ConceptNode = {
  slug: string
  title: string
  kind: Kind | null
  // The Parts that have their home in this Concept, without the Parts of
  // the Concepts in it.
  partCount: number
  concepts: ConceptNode[]
}

export type Project = {
  slug: string
  name: string
  // The root Concept.
  concept: ConceptNode
}

export type Concept = {
  slug: string
  title: string
  kind: Kind | null
  // The Concepts that hold this one, root first. The root has an empty path.
  path: { slug: string; title: string }[]
  concepts: ConceptNode[]
  // The Parts that have their home here.
  parts: PartSummary[]
  // The Parts with a home elsewhere that a link glues to a Part of this
  // Concept.
  linkedParts: PartSummary[]
  // The Joints with a Part of this Concept at one end or at both.
  joints: {
    id: number
    part: string
    needs: string
    twoWay: boolean
    link: boolean
  }[]
  // One slot per Part type of the Kind. Empty when the Concept has no Kind.
  slots: { type: PartType; filled: boolean }[]
}

// One Joint as one of its two Parts sees it: `part` is the Part at the
// other end.
export type JointEnd = {
  jointId: number
  twoWay: boolean
  link: boolean
  part: PartSummary
}

export type Part = PartSummary & {
  body: string
  owner: string | null
  date: string | null
  source: string | null
  metric: string | null
  enforcedBy: string | null
  evidenceLevel: EvidenceLevel | null
  issueUrl: string | null
  measure: {
    measure: GoalMeasure
    baseline: number | null
    latestValue: number | null
    latestBreakdownValue: string | null
    measuredAt: string | null
  } | null
  supersededBy: PartSummary | null
  supersedes: PartSummary[]
  // A two-way Joint shows in `needs` on both sides.
  needs: JointEnd[]
  neededBy: JointEnd[]
  // The open flags, oldest first.
  flags: Flag[]
  // The Part that a waiting Part waits on.
  waitsOn: PartSummary | null
  // The Signals that an Insight grew from, in the order they were picked.
  signals: { url: string; title: string }[]
}

const { projects, concepts, parts, joints, measures, flags, signals } = schema
const { partTypes } = schema

// The Part that a Joint needs, and the home Concept of that Part.
const neededParts = alias(parts, 'needed_parts')
const neededConcepts = alias(concepts, 'needed_concepts')

const summary = {
  id: parts.recordId,
  type: parts.type,
  title: parts.title,
  status: parts.status,
  trust: parts.trust,
  workState: parts.workState,
  concept: concepts.slug,
  conceptTitle: concepts.title,
}

const neededSummary = {
  id: neededParts.recordId,
  type: neededParts.type,
  title: neededParts.title,
  status: neededParts.status,
  trust: neededParts.trust,
  workState: neededParts.workState,
  concept: neededConcepts.slug,
  conceptTitle: neededConcepts.title,
}

// Parts sort by their type, then by the number of their record id: D2 comes
// before D10.
function sortParts(items: PartSummary[]): PartSummary[] {
  return partTypes.flatMap((type) =>
    sortById(items.filter((item) => item.type === type)),
  )
}

// The Parts that match, each with the slug of its home Concept.
async function listSummaries(db: ConceptDb, matches: SQL | undefined) {
  const found = await db
    .select(summary)
    .from(parts)
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(matches)
  return sortParts(found)
}

// The Joints that match, in the order of their ids, each with the Parts at
// both ends. A Joint between Parts of two Concepts is a link.
function listJoints(db: ConceptDb, matches: SQL | undefined) {
  return db
    .select({
      id: joints.id,
      twoWay: joints.twoWay,
      link: sql<boolean>`${parts.conceptId} <> ${neededParts.conceptId}`,
      partId: joints.partId,
      part: summary,
      needed: neededSummary,
    })
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .innerJoin(neededParts, eq(joints.neededPartId, neededParts.id))
    .innerJoin(neededConcepts, eq(neededParts.conceptId, neededConcepts.id))
    .where(matches)
    .orderBy(joints.id)
}

export function listProjects(
  db: ConceptDb,
): Promise<Pick<Project, 'slug' | 'name'>[]> {
  return db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .orderBy(projects.slug)
}

// The Concepts of the Project, each as the node of the tree it is in. A
// Concept holds its child Concepts in the order they were added.
async function listConcepts(db: ConceptDb, projectSlug: string) {
  const [rows, partCounts] = await Promise.all([
    db
      .select({
        id: concepts.id,
        parentId: concepts.parentId,
        slug: concepts.slug,
        title: concepts.title,
        kind: concepts.kind,
        projectName: projects.name,
      })
      .from(concepts)
      .innerJoin(projects, eq(concepts.projectId, projects.id))
      .where(eq(projects.slug, projectSlug))
      .orderBy(concepts.id),
    db
      .select({ conceptId: parts.conceptId, partCount: count() })
      .from(parts)
      .innerJoin(projects, eq(parts.projectId, projects.id))
      .where(eq(projects.slug, projectSlug))
      .groupBy(parts.conceptId),
  ])

  const counted = new Map(
    partCounts.map(({ conceptId, partCount }) => [conceptId, partCount]),
  )
  const found = new Map(
    rows.map(({ projectName, ...row }) => {
      const node: ConceptNode = {
        slug: row.slug,
        title: row.title,
        kind: row.kind,
        partCount: counted.get(row.id) ?? 0,
        concepts: [],
      }
      return [row.id, { ...row, projectName, node }]
    }),
  )
  for (const concept of found.values()) {
    if (concept.parentId === null) continue
    found.get(concept.parentId)?.node.concepts.push(concept.node)
  }
  return [...found.values()]
}

// The Project with the tree of its Concepts. A Project always has a root
// Concept, so one without Concepts counts as unknown.
export async function findProject(
  db: ConceptDb,
  projectSlug: string,
): Promise<Project | undefined> {
  const found = await listConcepts(db, projectSlug)
  const root = found.find((concept) => concept.parentId === null)
  if (!root) return undefined

  return { slug: projectSlug, name: root.projectName, concept: root.node }
}

export async function findConcept(
  db: ConceptDb,
  projectSlug: string,
  conceptSlug: string,
): Promise<Concept | undefined> {
  const found = await listConcepts(db, projectSlug)
  const concept = found.find(({ slug }) => slug === conceptSlug)
  if (!concept) return undefined

  const path: Concept['path'] = []
  let parentId = concept.parentId
  while (parentId !== null) {
    const parent = found.find(({ id }) => id === parentId)
    if (!parent) break
    path.unshift({ slug: parent.slug, title: parent.title })
    parentId = parent.parentId
  }

  const [homeParts, jointRows] = await Promise.all([
    listSummaries(db, eq(parts.conceptId, concept.id)),
    listJoints(
      db,
      or(
        eq(parts.conceptId, concept.id),
        eq(neededParts.conceptId, concept.id),
      ),
    ),
  ])

  const linked = new Map<string, PartSummary>()
  for (const { part, needed } of jointRows) {
    for (const end of [part, needed]) {
      if (end.concept !== conceptSlug) linked.set(end.id, end)
    }
  }
  const linkedParts = sortParts([...linked.values()])
  const slotTypes = concept.kind === null ? [] : kinds[concept.kind].slots

  return {
    slug: concept.slug,
    title: concept.title,
    kind: concept.kind,
    concepts: concept.node.concepts,
    path,
    parts: homeParts,
    linkedParts,
    joints: jointRows.map(({ id, twoWay, link, part, needed }) => ({
      id,
      part: part.id,
      needs: needed.id,
      twoWay,
      link,
    })),
    slots: slotTypes.map((type) => ({
      type,
      filled: [...homeParts, ...linkedParts].some((part) => part.type === type),
    })),
  }
}

// The Parts of the Project: all of them, or the ones of the given types. An
// unknown Project has none.
export function listParts(
  db: ConceptDb,
  projectSlug: string,
  types?: PartType[],
): Promise<PartSummary[]> {
  return listSummaries(
    db,
    and(
      eq(projects.slug, projectSlug),
      types === undefined ? undefined : inArray(parts.type, types),
    ),
  )
}

// What needs the owner now: the Parts of the Project in to-check, draft or
// review, the newest change first. An unknown Project has none.
export function listMine(
  db: ConceptDb,
  projectSlug: string,
): Promise<PartSummary[]> {
  return db
    .select(summary)
    .from(parts)
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(
      and(
        eq(projects.slug, projectSlug),
        inArray(parts.workState, ['to-check', 'draft', 'review']),
      ),
    )
    .orderBy(desc(parts.changedAt), desc(parts.id))
}

// The open flags of the Part, oldest first.
async function listFlags(db: ConceptDb, partId: number): Promise<Flag[]> {
  const found = await db
    .select({
      cause: { id: parts.recordId, title: parts.title },
      reason: flags.reason,
      createdAt: flags.createdAt,
    })
    .from(flags)
    .innerJoin(parts, eq(flags.causePartId, parts.id))
    .where(and(eq(flags.partId, partId), isNull(flags.closedAt)))
    .orderBy(flags.id)
  return found.map(({ createdAt, ...flag }) => ({
    ...flag,
    createdAt: createdAt.toISOString(),
  }))
}

export async function findPart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
): Promise<Part | undefined> {
  const found = await db
    .select({ part: parts, concept: concepts, measure: measures })
    .from(parts)
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .leftJoin(measures, eq(measures.partId, parts.id))
    .where(and(eq(projects.slug, projectSlug), eq(parts.recordId, recordId)))
  const row = found.at(0)
  if (!row) return undefined
  const { part, concept, measure } = row

  const [supersededBy, waitsOn, openFlags, supersedes, jointRows, grownFrom] =
    await Promise.all([
      part.supersededById === null
        ? []
        : listSummaries(db, eq(parts.id, part.supersededById)),
      part.awaitedPartId === null
        ? []
        : listSummaries(db, eq(parts.id, part.awaitedPartId)),
      listFlags(db, part.id),
      listSummaries(db, eq(parts.supersededById, part.id)),
      listJoints(
        db,
        or(eq(joints.partId, part.id), eq(joints.neededPartId, part.id)),
      ),
      db
        .select({ url: signals.url, title: signals.title })
        .from(signals)
        .where(eq(signals.partId, part.id))
        .orderBy(signals.id),
    ])

  const needs: JointEnd[] = []
  const neededBy: JointEnd[] = []
  for (const joint of jointRows) {
    const needing = joint.partId === part.id
    const end = {
      jointId: joint.id,
      twoWay: joint.twoWay,
      link: joint.link,
      part: needing ? joint.needed : joint.part,
    }
    if (needing || joint.twoWay) needs.push(end)
    else neededBy.push(end)
  }

  return {
    id: part.recordId,
    type: part.type,
    title: part.title,
    status: part.status,
    trust: part.trust,
    workState: part.workState,
    concept: concept.slug,
    conceptTitle: concept.title,
    body: part.body,
    owner: part.owner,
    date: part.date,
    source: part.source,
    metric: part.metric,
    enforcedBy: part.enforcedBy,
    evidenceLevel: part.evidenceLevel,
    issueUrl: part.issueUrl,
    measure: measure && {
      measure: measure.measure,
      baseline: measure.baseline,
      latestValue: measure.latestValue,
      latestBreakdownValue: measure.latestBreakdownValue,
      measuredAt: measure.measuredAt?.toISOString() ?? null,
    },
    supersededBy: supersededBy.at(0) ?? null,
    supersedes,
    needs,
    neededBy,
    flags: openFlags,
    waitsOn: waitsOn.at(0) ?? null,
    signals: grownFrom,
  }
}
