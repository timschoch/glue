import type { SQL } from 'drizzle-orm'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { canReference, getProjectId } from './projects.ts'
import { InvalidRecordError, PartNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

// Ask another team (glue/D51): a member with a Hunch asks another Project to
// check it. A member of that Project picks the Ask and hands back a
// published Insight of the own Project. The member who asked glues it to
// the Hunch: the Joint of a reference. Nothing moves and nothing is copied.
//
// The Neon HTTP driver has no transaction of its own. Thus each function
// writes with one statement.

const { asks, concepts, members, parts, projects } = schema

// What the Ask waits for: a member of the asked Project who picks it, the
// Insight that this member hands back, or the check of the member who asked.
export type AskStep = 'pick' | 'hand-back' | 'check'

// A Part of an Ask, with its Project and the slug of its home Concept.
export type AskPart = {
  project: { slug: string; name: string }
  id: string
  title: string
  concept: string
}

// An Ask that is open: the Hunch does not need the Insight yet.
export type Ask = {
  id: number
  step: AskStep
  hunch: AskPart
  // The Project that is asked.
  project: { slug: string; name: string }
  pickedBy: { name: string; email: string } | null
  // The Insight that was handed back.
  insight: AskPart | null
  askedAt: string
}

const hunches = alias(parts, 'hunches')
const hunchConcepts = alias(concepts, 'hunch_concepts')
const hunchProjects = alias(projects, 'hunch_projects')
const insights = alias(parts, 'handed_back')
const insightConcepts = alias(concepts, 'handed_back_concepts')

// The Hunch needs the Insight that was handed back: the Ask is done.
const isDone = sql`exists (
  select 1 from "joints"
  where "joints"."part_id" = ${asks.partId}
    and "joints"."needed_part_id" = ${asks.handedBackPartId}
)`

// The open Asks that match, the oldest first.
async function listOpenAsks(
  db: ConceptDb,
  matches: SQL | undefined,
): Promise<Ask[]> {
  const found = await db
    .select({
      id: asks.id,
      askedAt: asks.askedAt,
      hunch: {
        id: hunches.recordId,
        title: hunches.title,
        concept: hunchConcepts.slug,
      },
      hunchProject: { slug: hunchProjects.slug, name: hunchProjects.name },
      project: { slug: projects.slug, name: projects.name },
      pickedBy: { name: members.name, email: members.email },
      insight: {
        id: insights.recordId,
        title: insights.title,
        concept: insightConcepts.slug,
      },
    })
    .from(asks)
    .innerJoin(hunches, eq(asks.partId, hunches.id))
    .innerJoin(hunchConcepts, eq(hunches.conceptId, hunchConcepts.id))
    .innerJoin(hunchProjects, eq(hunches.projectId, hunchProjects.id))
    .innerJoin(projects, eq(asks.projectId, projects.id))
    .leftJoin(members, eq(asks.pickedById, members.id))
    .leftJoin(insights, eq(asks.handedBackPartId, insights.id))
    .leftJoin(insightConcepts, eq(insights.conceptId, insightConcepts.id))
    .where(and(matches, sql`not ${isDone}`))
    .orderBy(asks.id)

  return found.map(({ id, askedAt, hunch, hunchProject, project, ...ask }) => {
    const { id: insightId, title, concept } = ask.insight
    // The Insight is of the asked Project.
    const insight =
      insightId === null || title === null || concept === null
        ? null
        : { project, id: insightId, title, concept }
    return {
      id,
      step: insight ? 'check' : ask.pickedBy ? 'hand-back' : 'pick',
      hunch: { project: hunchProject, ...hunch },
      project,
      pickedBy: ask.pickedBy,
      insight,
      askedAt: askedAt.toISOString(),
    }
  })
}

// The Asks in Mine of a Project. For the asked Project: each Ask without an
// Insight, until a member picks it, and then only for that member. For the
// Project that asked: each Ask with an Insight to check, for the members who
// have the Hunch and for each member when nobody has it. Without the e-mail
// address of a member: all of them.
export function listMineAsks(
  db: ConceptDb,
  projectSlug: string,
  memberEmail?: string,
): Promise<Ask[]> {
  const isMember = sql`lower("members"."email") = lower(${memberEmail}::text)`
  const toPickOrHandBack = and(
    eq(projects.slug, projectSlug),
    isNull(asks.handedBackPartId),
    memberEmail === undefined
      ? undefined
      : sql`(${asks.pickedById} is null or ${isMember})`,
  )
  const toCheck = and(
    eq(hunchProjects.slug, projectSlug),
    isNotNull(asks.handedBackPartId),
    memberEmail === undefined
      ? undefined
      : sql`(
          not exists (
            select 1 from "assignments"
            where "assignments"."part_id" = ${asks.partId}
          )
          or exists (
            select 1 from "assignments"
            inner join "members" as owners
              on owners."id" = "assignments"."member_id"
            where "assignments"."part_id" = ${asks.partId}
              and lower(owners."email") = lower(${memberEmail}::text)
          )
        )`,
  )
  return listOpenAsks(db, sql`(${toPickOrHandBack} or ${toCheck})`)
}

// The open Ask of the Hunch.
export async function findOpenAsk(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
): Promise<Ask | undefined> {
  const found = await listOpenAsks(
    db,
    and(eq(hunchProjects.slug, projectSlug), eq(hunches.recordId, recordId)),
  )
  return found.at(0)
}

// The Projects that the Project may ask: the ones that it may reference.
export function listAskableProjects(
  db: ConceptDb,
  projectSlug: string,
): Promise<{ slug: string; name: string }[]> {
  const { projectReferences } = schema
  return db
    .select({ slug: projects.slug, name: projects.name })
    .from(projectReferences)
    .innerJoin(hunchProjects, eq(projectReferences.projectId, hunchProjects.id))
    .innerJoin(projects, eq(projectReferences.referencedProjectId, projects.id))
    .where(eq(hunchProjects.slug, projectSlug))
    .orderBy(projects.slug)
}

function parseInput<TOutput>(inputSchema: z.ZodType<TOutput>, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  return parsed.data
}

const idRowsSchema = z.object({ rows: z.array(z.object({ id: z.number() })) })

export const newAskSchema = z.strictObject({
  insight: z
    .string()
    .meta({ description: 'The record id of the Insight of the level Hunch' }),
  toProject: z.string().meta({
    description:
      'The slug of the Project that is asked: one that this Project may reference',
  }),
})

export type NewAsk = z.input<typeof newAskSchema>

// The Insight of the Project with the record id.
async function getInsight(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
) {
  const projectId = await getProjectId(db, projectSlug)
  const found = await db
    .select({
      id: parts.id,
      evidenceLevel: parts.evidenceLevel,
      workState: parts.workState,
    })
    .from(parts)
    .where(
      and(
        eq(parts.projectId, projectId),
        eq(parts.recordId, recordId),
        eq(parts.type, 'insight'),
      ),
    )
  const insight = found.at(0)
  if (!insight) throw new PartNotFoundError(recordId)
  return insight
}

// Asks the other Project to check the Hunch, and gives back the id of the
// Ask. The Project must be one that this Project may reference. A Hunch has
// one open Ask. An Insight with no level is a Hunch.
export async function addAsk(
  db: ConceptDb,
  projectSlug: string,
  ask: NewAsk,
  now = new Date(),
): Promise<number> {
  const { insight, toProject } = parseInput(newAskSchema, ask)
  const hunch = await getInsight(db, projectSlug, insight)
  if ((hunch.evidenceLevel ?? 'hunch') !== 'hunch')
    throw new InvalidRecordError(`"${insight}" is not a Hunch`)
  if (!(await canReference(db, projectSlug, toProject)))
    throw new InvalidRecordError(
      `Project "${projectSlug}" cannot ask Project "${toProject}"`,
    )
  const askedId = await getProjectId(db, toProject)
  const result = await db.execute(sql`
    insert into "asks" ("part_id", "project_id", "asked_at")
    select
      ${hunch.id}::integer,
      ${askedId}::integer,
      ${now.toISOString()}::timestamptz
    where not exists (
      select 1 from "asks"
      where "asks"."part_id" = ${hunch.id}::integer and not ${isDone}
    )
    returning "id"
  `)
  const added = idRowsSchema.parse(result).rows.at(0)
  if (!added) throw new InvalidRecordError(`"${insight}" has an Ask already`)
  return added.id
}

// The open Ask that the Project is asked.
async function getAsk(db: ConceptDb, projectSlug: string, askId: number) {
  const found = await listOpenAsks(
    db,
    and(eq(projects.slug, projectSlug), eq(asks.id, askId)),
  )
  const ask = found.at(0)
  if (!ask) throw new InvalidRecordError(`Ask ${askId} not found`)
  return ask
}

// The member of the asked Project picks the Ask. From now on it shows only
// in Mine of this member.
export async function pickAsk(
  db: ConceptDb,
  projectSlug: string,
  askId: number,
  memberEmail: string,
  now = new Date(),
): Promise<void> {
  const ask = await getAsk(db, projectSlug, askId)
  const found = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(projects, eq(members.projectId, projects.id))
    .where(
      and(
        eq(projects.slug, projectSlug),
        sql`lower(${members.email}) = lower(${memberEmail.trim()}::text)`,
      ),
    )
  const member = found.at(0)
  if (!member)
    throw new InvalidRecordError(
      `${memberEmail.trim()} is no member of ${projectSlug}.`,
    )
  const picked = ask.pickedBy
    ? []
    : await db
        .update(asks)
        .set({ pickedById: member.id, pickedAt: now })
        .where(and(eq(asks.id, askId), isNull(asks.pickedById)))
        .returning({ id: asks.id })
  if (picked.length === 0)
    throw new InvalidRecordError(
      `${ask.pickedBy?.name ?? 'A member'} picked Ask ${askId} already`,
    )
}

// The member who picked the Ask hands back a published Insight of the own
// Project. From now on the Ask shows in Mine of the Project that asked.
export async function handBackAsk(
  db: ConceptDb,
  projectSlug: string,
  askId: number,
  insightId: string,
  now = new Date(),
): Promise<void> {
  const ask = await getAsk(db, projectSlug, askId)
  if (ask.step === 'pick')
    throw new InvalidRecordError(`Ask ${askId} is not picked yet`)
  const insight = await getInsight(db, projectSlug, insightId)
  if (insight.workState !== 'published')
    throw new InvalidRecordError(`"${insightId}" is not published`)
  const handedBack = await db
    .update(asks)
    .set({ handedBackPartId: insight.id, handedBackAt: now })
    .where(and(eq(asks.id, askId), isNull(asks.handedBackPartId)))
    .returning({ id: asks.id })
  if (handedBack.length === 0)
    throw new InvalidRecordError(`Ask ${askId} has an Insight already`)
}
