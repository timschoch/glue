import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { ConceptDb } from './client.ts'
import { isOnTarget, toTarget } from './goal-measure.ts'
import type { GoalMeasure } from './goal-measure.ts'
import type { Kind } from './kinds.ts'
import type {
  EvidenceLevel,
  FlagReason,
  PartType,
  Question,
  Trust,
  WorkState,
} from './schema.ts'
import { kinds } from './kinds.ts'
import { listAnswers } from './part-trust.ts'
import type { Answer } from './part-trust.ts'
import { sortById } from './record-id.ts'
import * as schema from './schema.ts'

// The read side of the Part model: the shapes of a Project, a Concept and a
// Part as Glue shows them.

// The words of the Part model, for the code outside src/db.
export {
  decisionStatuses,
  evidenceLevels,
  flagReasons,
  partTypes,
  trusts,
  workStates,
} from './schema.ts'
export type {
  DecisionStatus,
  EvidenceLevel,
  FlagReason,
  PartType,
  Question,
  Trust,
  WorkState,
} from './schema.ts'
export { answers } from './part-trust.ts'
export type { Answer } from './part-trust.ts'

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

// How Glue measures a Goal or a Metric, and its newest reading against its
// target. No reading yet: no latest value and no time.
export type PartMeasure = {
  measure: GoalMeasure
  baseline: number | null
  latestValue: number | null
  latestBreakdownValue: string | null
  measuredAt: string | null
  // The value that a reading must reach. A mean has one after its first
  // reading.
  target: number | null
  // null: no reading yet.
  onTarget: boolean | null
}

// A Goal or a Metric with its measure. null: Glue does not measure it.
export type MeasuredPart = PartSummary & { measure: PartMeasure | null }

// An open flag of a Part: the Part that caused it, and why.
export type Flag = {
  cause: { id: string; title: string }
  reason: FlagReason
  createdAt: string
}

// One thing that happened to a Part: an edit, its first sign-off, or a flag
// that opened or closed. An answer closes the flags of a Part.
export type Activity =
  | { kind: 'changed' | 'published'; at: string }
  | {
      kind: 'flag-opened' | 'flag-closed'
      at: string
      cause: Flag['cause']
      reason: FlagReason
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
  // Only a reference has it: the Project of the Part at the other end.
  project?: { slug: string; name: string }
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
  // What a Decision asks, and the answer that it got.
  question: Question | null
  // A superseded Decision that was never accepted: it was not chosen.
  unchosen: boolean
  measure: PartMeasure | null
  // The Metrics and the measured Goals at the other end of its Joints.
  measured: MeasuredPart[]
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
  // The answers that the Work state takes, the usual one first.
  answers: Answer[]
  // What happened to the Part, newest first.
  activity: Activity[]
}

const { projects, concepts, parts, joints, measures, flags, signals } = schema
const { partTypes } = schema

// The Part that a Joint needs, and the home Concept of that Part.
const neededParts = alias(parts, 'needed_parts')
const neededConcepts = alias(concepts, 'needed_concepts')
const neededProjects = alias(projects, 'needed_projects')

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
function sortParts<TPart extends PartSummary>(items: TPart[]): TPart[] {
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

function toPartMeasure(row: typeof measures.$inferSelect): PartMeasure {
  const { measure, baseline, latestValue } = row
  return {
    measure,
    baseline,
    latestValue,
    latestBreakdownValue: row.latestBreakdownValue,
    measuredAt: row.measuredAt?.toISOString() ?? null,
    target: toTarget(measure, baseline),
    onTarget:
      latestValue === null ? null : isOnTarget(measure, baseline, latestValue),
  }
}

// The Metrics and the Goals with a measure that match, each with its
// measure.
async function listMeasuredParts(
  db: ConceptDb,
  matches: SQL | undefined,
): Promise<MeasuredPart[]> {
  const found = await db
    .select({ part: summary, measure: measures })
    .from(parts)
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .leftJoin(measures, eq(measures.partId, parts.id))
    .where(
      and(
        matches,
        or(
          eq(parts.type, 'metric'),
          and(eq(parts.type, 'goal'), isNotNull(measures.partId)),
        ),
      ),
    )
  return sortParts(
    found.map(({ part, measure }) => ({
      ...part,
      measure: measure && toPartMeasure(measure),
    })),
  )
}

// What the section Use shows: the Metrics and the measured Goals of the
// Project. An unknown Project has none.
export function listMeasured(
  db: ConceptDb,
  projectSlug: string,
): Promise<MeasuredPart[]> {
  return listMeasuredParts(db, eq(projects.slug, projectSlug))
}

// The Joints that match, in the order of their ids, each with the Parts at
// both ends. A Joint between Parts of two Concepts is a link. A Joint
// between Parts of two Projects is a reference.
function listJoints(db: ConceptDb, matches: SQL | undefined) {
  return db
    .select({
      id: joints.id,
      twoWay: joints.twoWay,
      link: sql<boolean>`${parts.conceptId} <> ${neededParts.conceptId}`,
      partId: joints.partId,
      part: summary,
      needed: neededSummary,
      reference: sql<boolean>`${parts.projectId} <> ${neededParts.projectId}`,
      neededProject: { slug: neededProjects.slug, name: neededProjects.name },
    })
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .innerJoin(neededParts, eq(joints.neededPartId, neededParts.id))
    .innerJoin(neededConcepts, eq(neededParts.conceptId, neededConcepts.id))
    .innerJoin(neededProjects, eq(neededParts.projectId, neededProjects.id))
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
    // A reference is not a Joint of the Concept: its Parts are of two
    // Projects.
    listJoints(
      db,
      and(
        eq(parts.projectId, neededParts.projectId),
        or(
          eq(parts.conceptId, concept.id),
          eq(neededParts.conceptId, concept.id),
        ),
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
// review, the newest change first. An unknown Project has none. With the
// e-mail address of a member: the Parts where the member is Responsible or
// Co-Author, and the Parts that nobody has.
export function listMine(
  db: ConceptDb,
  projectSlug: string,
  memberEmail?: string,
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
        memberEmail === undefined
          ? undefined
          : sql`(
              not exists (
                select 1 from "assignments"
                where "assignments"."part_id" = ${parts.id}
              )
              or exists (
                select 1 from "assignments"
                inner join "members" on "members"."id" = "assignments"."member_id"
                where "assignments"."part_id" = ${parts.id}
                  and lower("members"."email") = lower(${memberEmail}::text)
              )
            )`,
      ),
    )
    .orderBy(desc(parts.changedAt), desc(parts.id))
}

// The flags of the Part, open and closed, oldest first.
function listFlags(db: ConceptDb, partId: number) {
  return db
    .select({
      cause: { id: parts.recordId, title: parts.title },
      reason: flags.reason,
      createdAt: flags.createdAt,
      closedAt: flags.closedAt,
    })
    .from(flags)
    .innerJoin(parts, eq(flags.causePartId, parts.id))
    .where(eq(flags.partId, partId))
    .orderBy(flags.id)
}

// What the database keeps of the past of a Part, newest first. A write
// that publishes the Part or flags it also sets the time of its last change,
// so a change at the time of another entry is that entry.
function listActivity(
  part: { changedAt: Date; publishedAt: Date | null },
  partFlags: Awaited<ReturnType<typeof listFlags>>,
): Activity[] {
  const entries: Activity[] = partFlags.flatMap(
    ({ cause, reason, createdAt, closedAt }) => [
      { kind: 'flag-opened', at: createdAt.toISOString(), cause, reason },
      ...(closedAt === null
        ? []
        : [
            {
              kind: 'flag-closed' as const,
              at: closedAt.toISOString(),
              cause,
              reason,
            },
          ]),
    ],
  )
  if (part.publishedAt !== null) {
    entries.push({ kind: 'published', at: part.publishedAt.toISOString() })
  }
  const changedAt = part.changedAt.toISOString()
  if (entries.every(({ at }) => at !== changedAt)) {
    entries.push({ kind: 'changed', at: changedAt })
  }
  // An ISO time in UTC sorts as text.
  return entries.sort((one, other) => other.at.localeCompare(one.at))
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

  const [
    supersededBy,
    waitsOn,
    partFlags,
    supersedes,
    jointRows,
    grownFrom,
    measured,
  ] = await Promise.all([
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
    listMeasuredParts(
      db,
      and(
        eq(parts.projectId, part.projectId),
        sql`${parts.id} in (
          select "needed_part_id" from "joints" where "part_id" = ${part.id}
          union
          select "part_id" from "joints" where "needed_part_id" = ${part.id}
        )`,
      ),
    ),
  ])

  const needs: JointEnd[] = []
  const neededBy: JointEnd[] = []
  for (const joint of jointRows) {
    const needing = joint.partId === part.id
    // A reference shows on the Part that needs. The Project of the needed
    // Part does not list the Parts of other Projects.
    if (joint.reference && !needing) continue
    const end = {
      jointId: joint.id,
      twoWay: joint.twoWay,
      link: joint.link,
      part: needing ? joint.needed : joint.part,
      ...(joint.reference && { project: joint.neededProject }),
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
    question: part.question,
    unchosen: part.status === 'superseded' && part.publishedAt === null,
    measure: measure && toPartMeasure(measure),
    measured,
    supersededBy: supersededBy.at(0) ?? null,
    supersedes,
    needs,
    neededBy,
    flags: partFlags
      .filter(({ closedAt }) => closedAt === null)
      .map(({ cause, reason, createdAt }) => ({
        cause,
        reason,
        createdAt: createdAt.toISOString(),
      })),
    waitsOn: waitsOn.at(0) ?? null,
    signals: grownFrom,
    answers: listAnswers(part.workState),
    activity: listActivity(part, partFlags),
  }
}
