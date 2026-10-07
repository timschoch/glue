import type { SQL } from 'drizzle-orm'
import { and, eq, isNotNull, isNull, like, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { addJoint, findConceptId } from './part-records.ts'
import { canReference, getProjectId } from './projects.ts'
import { InvalidRecordError, PartNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'

// Ask another Project. A member names a Part that waits for an answer and asks
// another Project for it. A member of that Project picks the Ask and hands
// back a published Part of the own Project. The Ask is done when the Part
// that waits needs that Part: the Joint of a reference. Nothing moves and
// nothing is copied.
//
// An Ask for an Insight (glue/D51): the Part that waits is a Hunch. The
// member who asked checks the Insight and glues it to the Hunch.
// An Ask for a Decision (glue/D56): each Part can wait, and the member
// writes a question. Glue adds the Joint when the Decision is handed back.
// A study (glue/D69): the member who picked the Ask starts a Concept for
// it. A published Insight of the study goes back, and Glue adds the Joint.
//
// The Neon HTTP driver has no transaction of its own. Thus each function
// writes with one statement. The hand back that ends an Ask writes two: when
// the Joint fails, it takes the first one back, so the Ask is as it was.

const { asks, concepts, members, parts, projects } = schema

export const askKinds = schema.askKinds
export type AskKind = schema.AskKind

// What the Ask waits for: a member of the asked Project who picks it, the
// Part that this member hands back, or the check of the member who asked.
export type AskStep = 'pick' | 'hand-back' | 'check'

// A Part of an Ask, with its Project and the slug of its home Concept.
export type AskPart = {
  project: { slug: string; name: string }
  id: string
  type: schema.PartType
  title: string
  trust: schema.Trust
  concept: string
}

// An Ask that is open: the Part that waits does not need the Part that was
// handed back yet.
export type Ask = {
  id: number
  kind: AskKind
  step: AskStep
  // The Part that waits for the answer.
  part: AskPart
  // The Project that is asked.
  project: { slug: string; name: string }
  question: string | null
  // The member who made the Ask. An Ask from before glue/D56 has none.
  askedBy: { name: string; email: string } | null
  pickedBy: { name: string; email: string } | null
  handedBack: AskPart | null
  // The Concept of the asked Project that answers the Ask.
  study: { slug: string; title: string } | null
  askedAt: string
}

const waiting = alias(parts, 'waiting')
const waitingConcepts = alias(concepts, 'waiting_concepts')
const waitingProjects = alias(projects, 'waiting_projects')
const handedBackParts = alias(parts, 'handed_back')
const handedBackConcepts = alias(concepts, 'handed_back_concepts')
const askers = alias(members, 'askers')
const studies = alias(concepts, 'studies')

// The Part that waits needs the Part that was handed back: the Ask is done.
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
      kind: asks.kind,
      question: asks.question,
      askedAt: asks.askedAt,
      part: {
        id: waiting.recordId,
        type: waiting.type,
        title: waiting.title,
        trust: waiting.trust,
        concept: waitingConcepts.slug,
      },
      partProject: { slug: waitingProjects.slug, name: waitingProjects.name },
      project: { slug: projects.slug, name: projects.name },
      askedBy: { name: askers.name, email: askers.email },
      pickedBy: { name: members.name, email: members.email },
      handedBack: {
        id: handedBackParts.recordId,
        type: handedBackParts.type,
        title: handedBackParts.title,
        trust: handedBackParts.trust,
        concept: handedBackConcepts.slug,
      },
      study: { slug: studies.slug, title: studies.title },
    })
    .from(asks)
    .innerJoin(waiting, eq(asks.partId, waiting.id))
    .innerJoin(waitingConcepts, eq(waiting.conceptId, waitingConcepts.id))
    .innerJoin(waitingProjects, eq(waiting.projectId, waitingProjects.id))
    .innerJoin(projects, eq(asks.projectId, projects.id))
    .leftJoin(askers, eq(asks.askedById, askers.id))
    .leftJoin(members, eq(asks.pickedById, members.id))
    .leftJoin(handedBackParts, eq(asks.handedBackPartId, handedBackParts.id))
    .leftJoin(
      handedBackConcepts,
      eq(handedBackParts.conceptId, handedBackConcepts.id),
    )
    .leftJoin(studies, eq(studies.askId, asks.id))
    .where(and(matches, sql`not ${isDone}`))
    .orderBy(asks.id)

  return found.map(({ askedAt, part, partProject, project, ...ask }) => {
    const { id, type, title, trust, concept } = ask.handedBack
    // The Part that was handed back is of the asked Project.
    const handedBack =
      id === null ||
      type === null ||
      title === null ||
      trust === null ||
      concept === null
        ? null
        : { project, id, type, title, trust, concept }
    return {
      id: ask.id,
      kind: ask.kind,
      step: handedBack ? 'check' : ask.pickedBy ? 'hand-back' : 'pick',
      part: { project: partProject, ...part },
      project,
      question: ask.question,
      askedBy: ask.askedBy,
      pickedBy: ask.pickedBy,
      handedBack,
      study: ask.study,
      askedAt: askedAt.toISOString(),
    }
  })
}

// The member has the Part that waits, or nobody has it. Such a member
// checks what was handed back, and stands for the member who asked when the
// Ask names none.
const hasPart = (memberEmail: string) => sql`(
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
)`

// The Asks in Mine of a Project. For the asked Project: each Ask with
// nothing handed back, until a member picks it, and then only for that
// member. For the Project that asked: each Ask with a Part to check, for the
// members who have the Part that waits and for each member when nobody has
// it. Without the e-mail address of a member: all of them.
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
    eq(waitingProjects.slug, projectSlug),
    isNotNull(asks.handedBackPartId),
    memberEmail === undefined ? undefined : hasPart(memberEmail),
  )
  return listOpenAsks(db, sql`(${toPickOrHandBack} or ${toCheck})`)
}

// The open Ask of the Part that waits.
export async function findOpenAsk(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
): Promise<Ask | undefined> {
  const found = await listOpenAsks(
    db,
    and(eq(waitingProjects.slug, projectSlug), eq(waiting.recordId, recordId)),
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
    .innerJoin(
      waitingProjects,
      eq(projectReferences.projectId, waitingProjects.id),
    )
    .innerJoin(projects, eq(projectReferences.referencedProjectId, projects.id))
    .where(eq(waitingProjects.slug, projectSlug))
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
  kind: z.enum(askKinds).default('insight').meta({
    description:
      'What the Ask asks for. insight: the check of a Hunch. decision: a Decision',
  }),
  part: z.string().meta({
    description:
      'The record id of the Part that waits for the answer. An Ask for an Insight: an Insight of the level Hunch',
  }),
  toProject: z.string().meta({
    description:
      'The slug of the Project that is asked: one that this Project may reference',
  }),
  question: z.string().trim().min(1).optional().meta({
    description:
      'What the member who asks wants to know. An Ask for a Decision needs it',
  }),
})

export type NewAsk = z.input<typeof newAskSchema>

// The Part of the Project with the record id.
async function getPart(db: ConceptDb, projectSlug: string, recordId: string) {
  const projectId = await getProjectId(db, projectSlug)
  const found = await db
    .select({
      id: parts.id,
      type: parts.type,
      evidenceLevel: parts.evidenceLevel,
      workState: parts.workState,
      concept: concepts.slug,
    })
    .from(parts)
    .innerJoin(concepts, eq(parts.conceptId, concepts.id))
    .where(and(eq(parts.projectId, projectId), eq(parts.recordId, recordId)))
  const part = found.at(0)
  if (!part) throw new PartNotFoundError(recordId)
  return part
}

// Asks the other Project, and gives back the id of the Ask. The Project must
// be one that this Project may reference. A Part has one open Ask, and a
// sunk Part has none. An Ask for an Insight is the Ask of a Hunch: an
// Insight with no level is a Hunch. An Ask for a Decision has a question.
// `memberEmail` is the member of the Project who asks.
export async function addAsk(
  db: ConceptDb,
  projectSlug: string,
  ask: NewAsk,
  memberEmail?: string,
  now = new Date(),
): Promise<number> {
  const { kind, part, toProject, question } = parseInput(newAskSchema, ask)
  const waits = await getPart(db, projectSlug, part)
  const isHunch =
    waits.type === 'insight' && (waits.evidenceLevel ?? 'hunch') === 'hunch'
  if (kind === 'insight' && !isHunch)
    throw new InvalidRecordError(`"${part}" is not a Hunch`)
  if (kind === 'decision' && question === undefined)
    throw new InvalidRecordError('an Ask for a Decision needs a question')
  if (waits.workState === 'sunk')
    throw new InvalidRecordError(`"${part}" is sunk`)
  if (!(await canReference(db, projectSlug, toProject)))
    throw new InvalidRecordError(
      `Project "${projectSlug}" cannot ask Project "${toProject}"`,
    )
  const asker =
    memberEmail === undefined
      ? null
      : await getMember(db, projectSlug, memberEmail)
  const askedId = await getProjectId(db, toProject)
  const result = await db.execute(sql`
    insert into "asks" (
      "kind", "part_id", "project_id", "question", "asked_by_id", "asked_at"
    )
    select
      ${kind}::text,
      ${waits.id}::integer,
      ${askedId}::integer,
      ${question ?? null}::text,
      ${asker?.id ?? null}::integer,
      ${now.toISOString()}::timestamptz
    where not exists (
      select 1 from "asks"
      where "asks"."part_id" = ${waits.id}::integer and not ${isDone}
    )
    returning "id"
  `)
  const added = idRowsSchema.parse(result).rows.at(0)
  if (!added) throw new InvalidRecordError(`"${part}" has an Ask already`)
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

// The member of the Project with the e-mail address.
async function getMember(
  db: ConceptDb,
  projectSlug: string,
  memberEmail: string,
) {
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
  return member
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
  const member = await getMember(db, projectSlug, memberEmail)
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

// The member who picked the Ask starts its study: a Concept of the asked
// Project that names the Ask. It takes the title of the Part that waits.
// An Ask has one study. Gives back the slug of the study: `study-7`, or
// `study-7-2` when a Concept of the Project has that slug.
export async function startStudy(
  db: ConceptDb,
  projectSlug: string,
  askId: number,
  memberEmail: string,
): Promise<string> {
  const ask = await getAsk(db, projectSlug, askId)
  if (ask.step === 'pick')
    throw new InvalidRecordError(`Ask ${askId} is not picked yet`)
  const email = memberEmail.trim()
  if (ask.pickedBy?.email.toLowerCase() !== email.toLowerCase())
    throw new InvalidRecordError(`${email} did not pick Ask ${askId}`)
  const projectId = await getProjectId(db, projectSlug)
  const parentId = await findConceptId(db, projectId, undefined)
  const base = `study-${askId}`
  const found = await db
    .select({ slug: concepts.slug })
    .from(concepts)
    .where(
      and(eq(concepts.projectId, projectId), like(concepts.slug, `${base}%`)),
    )
  const taken = new Set(found.map((concept) => concept.slug))
  let slug = base
  for (let count = 2; taken.has(slug); count++) slug = `${base}-${count}`
  const started = ask.study
    ? []
    : await db
        .insert(concepts)
        .values({ projectId, parentId, slug, title: ask.part.title, askId })
        .onConflictDoNothing({ target: concepts.askId })
        .returning({ slug: concepts.slug })
  if (started.length === 0)
    throw new InvalidRecordError(`Ask ${askId} has a study already`)
  return slug
}

// The Part type that an Ask of each kind takes back, in words.
const handedBackTypes: Record<AskKind, string> = {
  insight: 'an Insight',
  decision: 'a Decision',
}

// The member who picked the Ask hands back a published Part of the own
// Project: an Insight or a Decision, as the kind of the Ask says. An Ask
// with an Insight shows in Mine of the Project that asked from now on. An
// Ask with a Decision is done: Glue adds the Joint from the Part that waits
// to the Decision. An Ask with a study takes an Insight with its home in
// the study, and is done in the same way. `memberEmail` is the member who
// hands back. Without it nobody is checked: the CLI, and a token of no
// member.
export async function handBackAsk(
  db: ConceptDb,
  projectSlug: string,
  askId: number,
  recordId: string,
  memberEmail?: string,
  now = new Date(),
): Promise<void> {
  const ask = await getAsk(db, projectSlug, askId)
  if (ask.step === 'pick')
    throw new InvalidRecordError(`Ask ${askId} is not picked yet`)
  const email = memberEmail?.trim()
  if (
    email !== undefined &&
    ask.pickedBy?.email.toLowerCase() !== email.toLowerCase()
  )
    throw new InvalidRecordError(`${email} did not pick Ask ${askId}`)
  const part = await getPart(db, projectSlug, recordId)
  const kind = ask.study ? 'insight' : ask.kind
  if (part.type !== kind)
    throw new InvalidRecordError(
      `"${recordId}" is not ${handedBackTypes[kind]}`,
    )
  if (ask.study && part.concept !== ask.study.slug)
    throw new InvalidRecordError(
      `"${recordId}" is not in the study of Ask ${askId}`,
    )
  if (part.workState !== 'published')
    throw new InvalidRecordError(`"${recordId}" is not published`)
  const handedBack = await db
    .update(asks)
    .set({ handedBackPartId: part.id, handedBackAt: now })
    .where(and(eq(asks.id, askId), isNull(asks.handedBackPartId)))
    .returning({ id: asks.id })
  if (handedBack.length === 0)
    throw new InvalidRecordError(`Ask ${askId} is handed back already`)
  if (ask.kind !== 'decision' && !ask.study) return
  try {
    await addJoint(db, ask.part.project.slug, {
      part: ask.part.id,
      needs: `${projectSlug}/${recordId}`,
    })
  } catch (error) {
    await db
      .update(asks)
      .set({ handedBackPartId: null, handedBackAt: null })
      .where(and(eq(asks.id, askId), eq(asks.handedBackPartId, part.id)))
    throw error
  }
}

// The member who asked takes the Ask back while no member picked it. The
// Ask is gone, and the Part can ask again. An Ask that names no member who
// asked: a member who has the Part that waits, or each member when nobody
// has it.
export async function takeBackAsk(
  db: ConceptDb,
  projectSlug: string,
  askId: number,
  memberEmail: string,
): Promise<void> {
  const isAsk = and(eq(waitingProjects.slug, projectSlug), eq(asks.id, askId))
  const found = await listOpenAsks(db, isAsk)
  const ask = found.at(0)
  if (!ask) throw new InvalidRecordError(`Ask ${askId} not found`)
  await getMember(db, projectSlug, memberEmail)
  const email = memberEmail.trim()
  if (ask.askedBy) {
    if (ask.askedBy.email.toLowerCase() !== email.toLowerCase())
      throw new InvalidRecordError(`${email} did not make Ask ${askId}`)
  } else {
    const own = await listOpenAsks(db, and(isAsk, hasPart(email)))
    if (own.length === 0)
      throw new InvalidRecordError(
        `${email} does not have the Hunch of Ask ${askId}`,
      )
  }
  const takenBack = ask.pickedBy
    ? []
    : await db
        .delete(asks)
        .where(and(eq(asks.id, askId), isNull(asks.pickedById)))
        .returning({ id: asks.id })
  if (takenBack.length === 0)
    throw new InvalidRecordError(
      `${ask.pickedBy?.name ?? 'A member'} picked Ask ${askId} already`,
    )
}
