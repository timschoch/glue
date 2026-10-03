import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { InvalidRecordError, ProductNotFoundError } from './concept-records.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import type { GoalMeasure } from './goal-measure.ts'
import { kinds } from './kinds.ts'
import type { Kind } from './kinds.ts'
import * as schema from './schema.ts'

// The write side of the Part model. No code calls it yet.
//
// The Neon HTTP driver has no transaction of its own. Thus each function
// writes with one statement, so a network failure never leaves a part of
// the change.

const text = z.string().trim().min(1)

// Reads the input with the schema. What breaks a rule is refused with the
// same error as a record that breaks a rule.
function parseInput<TOutput>(inputSchema: z.ZodType<TOutput>, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success)
    throw new InvalidRecordError(z.prettifyError(parsed.error))
  return parsed.data
}

async function findProjectId(db: ConceptDb, projectSlug: string) {
  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.slug, projectSlug))
  if (projects.length === 0) throw new ProductNotFoundError(projectSlug)
  return projects[0].id
}

// Adds the Project when it does not exist, and its root Concept when it has
// none. The root takes the slug and the name of the Project.
export async function addProject(
  db: ConceptDb,
  projectSlug: string,
): Promise<void> {
  await db.execute(sql`
    with project as (
      insert into "projects" ("slug", "name")
      values (${projectSlug}::text, ${projectSlug}::text)
      on conflict ("slug") do update set "slug" = excluded."slug"
      returning "id", "slug", "name"
    )
    insert into "concepts" ("project_id", "slug", "title")
    select "id", "slug", "name" from project
    on conflict ("project_id") where "parent_id" is null do nothing
  `)
}

const conceptSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    error: 'a slug is lowercase words joined by hyphens',
  }),
  title: text,
  kind: z.literal(Object.keys(kinds) as Kind[]).optional(),
  parent: z.string().optional().meta({
    description: 'The slug of the Concept that holds it. Default: the root',
  }),
})

export type NewConcept = z.input<typeof conceptSchema>

// The Concept of the slug, or the root Concept of the Project.
async function findConceptId(
  db: ConceptDb,
  projectId: number,
  slug: string | undefined,
) {
  const { concepts } = schema
  const found = await db
    .select({ id: concepts.id })
    .from(concepts)
    .where(
      and(
        eq(concepts.projectId, projectId),
        slug === undefined
          ? isNull(concepts.parentId)
          : eq(concepts.slug, slug),
      ),
    )
  if (found.length === 0)
    throw new InvalidRecordError(`concept "${slug ?? 'root'}" not found`)
  return found[0].id
}

// Nests a Concept in its parent, and gives back its slug.
export async function addConcept(
  db: ConceptDb,
  projectSlug: string,
  concept: NewConcept,
): Promise<string> {
  const { slug, title, kind, parent } = parseInput(conceptSchema, concept)
  const projectId = await findProjectId(db, projectSlug)
  const parentId = await findConceptId(db, projectId, parent)
  const added = await db
    .insert(schema.concepts)
    .values({ projectId, parentId, slug, title, kind })
    .onConflictDoNothing()
    .returning({ slug: schema.concepts.slug })
  if (added.length === 0)
    throw new InvalidRecordError(`concept "${slug}" exists already`)
  return added[0].slug
}

// The first letter of the record id of each Part type (D38).
const PREFIXES: Record<schema.PartType, string> = {
  insight: 'I',
  goal: 'G',
  decision: 'D',
  guardrail: 'R',
  entity: 'E',
  flow: 'F',
  metric: 'M',
}

const date = z.iso.date()

const commonFields = {
  title: text,
  body: z.string().optional(),
  owner: text.nullable().optional(),
  source: text.nullable().optional(),
}

const plainSchema = z.strictObject(commonFields)

// The fields of each Part type. The check `parts_type_fields_check` holds
// the same rules. A Decision becomes superseded by its successor only, so
// that status is not a field value.
const fieldSchemas = {
  insight: z.strictObject({
    ...commonFields,
    source: text,
    date: date.optional(),
    status: z.literal('draft').nullable().optional(),
    evidenceLevel: z.enum(schema.evidenceLevels).nullable().optional(),
  }),
  goal: z.strictObject({
    ...commonFields,
    source: text,
    metric: text,
    status: z.enum(schema.goalStatuses).optional(),
  }),
  decision: z.strictObject({
    ...commonFields,
    owner: text,
    date: date.optional(),
    status: z.enum(['proposed', 'accepted']),
    issueUrl: z.url().nullable().optional(),
  }),
  guardrail: z.strictObject({ ...commonFields, enforcedBy: text }),
  entity: plainSchema,
  flow: plainSchema,
  metric: plainSchema,
}

const changeSchemas = {
  insight: fieldSchemas.insight.partial(),
  goal: fieldSchemas.goal.partial(),
  decision: fieldSchemas.decision.partial(),
  guardrail: fieldSchemas.guardrail.partial(),
  entity: plainSchema.partial(),
  flow: plainSchema.partial(),
  metric: plainSchema.partial(),
}

// The fields of all types as one shape: what a row of `parts` takes.
type PartFields = {
  title: string
  body?: string
  owner?: string | null
  source?: string | null
  status?: string | null
  date?: string
  metric?: string
  enforcedBy?: string
  issueUrl?: string | null
  evidenceLevel?: schema.EvidenceLevel | null
}

const partSchemas: Record<schema.PartType, z.ZodType<PartFields>> = fieldSchemas
const partChangeSchemas: Record<
  schema.PartType,
  z.ZodType<Partial<PartFields>>
> = changeSchemas

// Where a new Part goes, and what it is glued to.
const placeSchema = z.object({
  type: z.enum(schema.partTypes),
  concept: z.string().optional().meta({
    description: 'The slug of the home Concept. Default: the root',
  }),
  needs: z
    .array(z.string())
    .optional()
    .meta({ description: 'The record ids of the Parts that it needs' }),
  supersedes: z.string().optional().meta({
    description: 'The record id of the Decision that it replaces',
  }),
})

type Place = Omit<z.input<typeof placeSchema>, 'type'>

export type NewPart = {
  [Type in schema.PartType]: { type: Type } & Place &
    z.input<(typeof fieldSchemas)[Type]>
}[schema.PartType]

export type PartChange = {
  [Type in schema.PartType]: z.input<(typeof changeSchemas)[Type]>
}[schema.PartType]

// The Parts of the record ids in the Project, in the order of the ids.
async function findParts(
  db: ConceptDb,
  projectId: number,
  recordIds: string[],
) {
  const { parts } = schema
  const found = await db
    .select({
      id: parts.id,
      recordId: parts.recordId,
      type: parts.type,
      status: parts.status,
    })
    .from(parts)
    .where(
      and(eq(parts.projectId, projectId), inArray(parts.recordId, recordIds)),
    )
  return recordIds.map((recordId) => {
    const part = found.find((row) => row.recordId === recordId)
    if (!part) throw new InvalidRecordError(`"${recordId}" not found`)
    return part
  })
}

async function findPart(db: ConceptDb, projectSlug: string, recordId: string) {
  const projectId = await findProjectId(db, projectSlug)
  const [part] = await findParts(db, projectId, [recordId])
  return part
}

async function findDecision(
  db: ConceptDb,
  projectId: number,
  recordId: string,
) {
  const [part] = await findParts(db, projectId, [recordId])
  if (part.type !== 'decision')
    throw new InvalidRecordError(`"${recordId}" is not a Decision`)
  return part
}

const EVIDENCE_TYPES: schema.PartType[] = ['insight', 'guardrail']

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

const addedPartSchema = z.object({
  rows: z.array(z.object({ record_id: z.string() })),
})

// Adds a Part to its home Concept, and gives back its record id.
export async function addPart(
  db: ConceptDb,
  projectSlug: string,
  part: NewPart,
): Promise<string> {
  const {
    type,
    concept,
    needs = [],
    supersedes,
  } = parseInput(placeSchema, part)
  const {
    type: _type,
    concept: _concept,
    needs: _needs,
    supersedes: _supersedes,
    ...inputFields
  } = part
  const fields = parseInput(partSchemas[type], inputFields)
  if (supersedes !== undefined && type !== 'decision')
    throw new InvalidRecordError('only a Decision supersedes')
  if (supersedes !== undefined && fields.status !== 'accepted')
    throw new InvalidRecordError('"supersedes" needs the status "accepted"')

  const projectId = await findProjectId(db, projectSlug)
  const conceptId = await findConceptId(db, projectId, concept)
  const neededParts = await findParts(db, projectId, [...new Set(needs)])
  if (type === 'decision') {
    if (!neededParts.some((needed) => needed.type === 'goal'))
      throw new InvalidRecordError('a Decision needs a Goal')
    if (!neededParts.some((needed) => EVIDENCE_TYPES.includes(needed.type)))
      throw new InvalidRecordError(
        'a Decision needs evidence: an Insight or a Guardrail',
      )
  }
  const supersededId =
    supersedes === undefined
      ? undefined
      : (await findDecision(db, projectId, supersedes)).id

  const status = fields.status ?? (type === 'goal' ? 'open' : null)
  const isDated = type === 'decision' || type === 'insight'

  // The statement locks the Decision that it supersedes and adds nothing
  // when that Decision is superseded already. Thus the second of two
  // requests that supersede the same Decision changes nothing.
  const oldDecision =
    supersededId === undefined
      ? sql``
      : sql`old_decision as (
          select "id" from "parts"
          where "id" = ${supersededId}::integer and "status" <> 'superseded'
          for update
        ),`
  // The Joints go in by their position, so their ids keep the order.
  const neededValues = sql.join(
    neededParts.map(
      (needed, position) => sql`(${position}::integer, ${needed.id}::integer)`,
    ),
    sql`, `,
  )
  // The counter only grows, so the id of a deleted Part does not come back,
  // and two statements never read the same number. A type without a counter
  // counts on from its highest id.
  const result = await db.execute(sql`
    with ${oldDecision}
    counter as (
      insert into "part_counters" ("project_id", "type", "last_number")
      select
        ${projectId}::integer,
        ${type}::text,
        (
          select coalesce(max(substring("record_id" from 2)::integer), 0) + 1
          from "parts"
          where "project_id" = ${projectId}::integer and "type" = ${type}::text
        )
      ${supersededId === undefined ? sql`` : sql`from old_decision`}
      on conflict ("project_id", "type")
      do update set "last_number" = "part_counters"."last_number" + 1
      returning "last_number"
    ),
    added_part as (
      insert into "parts" (
        "project_id", "concept_id", "type", "record_id", "title", "body",
        "owner", "status", "date", "source", "metric", "enforced_by",
        "issue_url", "evidence_level"
      )
      select
        ${projectId}::integer,
        ${conceptId}::integer,
        ${type}::text,
        ${PREFIXES[type]}::text || "last_number",
        ${fields.title}::text,
        ${fields.body ?? ''}::text,
        ${fields.owner ?? null}::text,
        ${status}::text,
        ${fields.date ?? (isDated ? todayUtc() : null)}::date,
        ${fields.source ?? null}::text,
        ${fields.metric ?? null}::text,
        ${fields.enforcedBy ?? null}::text,
        ${fields.issueUrl ?? null}::text,
        ${fields.evidenceLevel ?? null}::text
      from counter
      returning "id", "record_id"
    )
    ${
      neededParts.length === 0
        ? sql``
        : sql`, added_joints as (
            insert into "joints" ("part_id", "needed_part_id")
            select added_part."id", needed."id"
            from added_part,
              (values ${neededValues}) as needed ("position", "id")
            order by needed."position"
          )`
    }
    ${
      supersededId === undefined
        ? sql``
        : sql`, superseded as (
            update "parts"
            set "status" = 'superseded',
              "superseded_by_id" = (select "id" from added_part)
            where "id" in (select "id" from old_decision)
          )`
    }
    select "record_id" from added_part
  `)

  const { rows } = addedPartSchema.parse(result)
  if (rows.length === 0)
    throw new InvalidRecordError(`"${supersedes}" is superseded already`)
  return rows[0].record_id
}

// Sets the fields that the change names. A superseded Decision that gets
// another status has no successor any more.
export async function updatePart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  change: PartChange,
): Promise<void> {
  const part = await findPart(db, projectSlug, recordId)
  const fields = parseInput(partChangeSchemas[part.type], change)
  const values: unknown[] = Object.values(fields)
  if (values.every((value) => value === undefined))
    throw new InvalidRecordError('send at least one field')
  await db
    .update(schema.parts)
    .set({
      ...fields,
      ...(part.type === 'decision' &&
        fields.status !== undefined && { supersededById: null }),
    })
    .where(eq(schema.parts.id, part.id))
}

const jointSchema = z.strictObject({
  part: z
    .string()
    .meta({ description: 'The record id of the Part that needs' }),
  needs: z.string().meta({ description: 'The record id of the needed Part' }),
  twoWay: z.boolean().optional(),
})

export type NewJoint = z.input<typeof jointSchema>

// Glues two Parts of the Project, and gives back the id of the Joint. Parts
// with different home Concepts make a link: the same Joint, never a copy.
export async function addJoint(
  db: ConceptDb,
  projectSlug: string,
  joint: NewJoint,
): Promise<number> {
  const { part, needs, twoWay } = parseInput(jointSchema, joint)
  if (part === needs) throw new InvalidRecordError('a Part cannot need itself')
  const projectId = await findProjectId(db, projectSlug)
  const [needingPart, neededPart] = await findParts(db, projectId, [
    part,
    needs,
  ])
  const added = await db
    .insert(schema.joints)
    .values({ partId: needingPart.id, neededPartId: neededPart.id, twoWay })
    .onConflictDoNothing()
    .returning({ id: schema.joints.id })
  if (added.length === 0)
    throw new InvalidRecordError(
      `"${part}" and "${needs}" have a Joint already`,
    )
  return added[0].id
}

// Removes the Joint, but not the last Goal and not the last evidence that a
// Decision needs: addPart refuses a Decision without them.
export async function removeJoint(
  db: ConceptDb,
  projectSlug: string,
  jointId: number,
): Promise<void> {
  const projectId = await findProjectId(db, projectSlug)
  const { joints } = schema
  const inProject = and(
    eq(joints.id, jointId),
    sql`${joints.partId} in (
      select "id" from "parts" where "project_id" = ${projectId}::integer
    )`,
  )
  const removed = await db
    .delete(joints)
    .where(
      and(
        inProject,
        sql`not exists (
          select 1 from "parts" as part, "parts" as needed
          where part."id" = ${joints.partId}
            and needed."id" = ${joints.neededPartId}
            and part."type" = 'decision'
            and needed."type" in ('goal', 'insight', 'guardrail')
            and not exists (
              select 1 from "joints" as other, "parts" as other_needed
              where other."part_id" = ${joints.partId}
                and other."id" <> ${joints.id}
                and other_needed."id" = other."needed_part_id"
                and other_needed."type" in ('goal', 'insight', 'guardrail')
                and (other_needed."type" = 'goal') = (needed."type" = 'goal')
            )
        )`,
      ),
    )
    .returning({ id: joints.id })
  if (removed.length > 0) return

  const found = await db.select({ id: joints.id }).from(joints).where(inProject)
  throw new InvalidRecordError(
    found.length === 0
      ? `joint ${jointId} not found`
      : `a Decision needs a Goal and evidence: joint ${jointId} is its last one`,
  )
}

// Replaces a Decision with an accepted one. The old Decision keeps its
// record id and points to its successor. The update itself asks for a
// Decision that is not superseded, so it keeps its first successor.
export async function supersedeDecision(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  supersededByRecordId: string,
): Promise<void> {
  if (recordId === supersededByRecordId)
    throw new InvalidRecordError('a Decision cannot supersede itself')
  const projectId = await findProjectId(db, projectSlug)
  const decision = await findDecision(db, projectId, recordId)
  const successor = await findDecision(db, projectId, supersededByRecordId)
  if (successor.status !== 'accepted')
    throw new InvalidRecordError(`"${supersededByRecordId}" is not accepted`)

  const { parts } = schema
  const superseded = await db
    .update(parts)
    .set({ status: 'superseded', supersededById: successor.id })
    .where(and(eq(parts.id, decision.id), ne(parts.status, 'superseded')))
    .returning({ id: parts.id })
  if (superseded.length === 0)
    throw new InvalidRecordError(`"${recordId}" is superseded already`)
}

const MEASURED_TYPES: schema.PartType[] = ['goal', 'metric']

// Sets how Glue measures a Goal or a Metric. A new measure reads another
// metric, so it removes the readings. null: Glue stops measuring the Part.
export async function setMeasure(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  measure: GoalMeasure | null,
): Promise<void> {
  const part = await findPart(db, projectSlug, recordId)
  if (!MEASURED_TYPES.includes(part.type))
    throw new InvalidRecordError(`"${recordId}" is not a Goal or a Metric`)
  const { measures } = schema
  if (measure === null) {
    await db.delete(measures).where(eq(measures.partId, part.id))
    return
  }
  const parsedMeasure = parseInput(goalMeasureSchema, measure)
  await db
    .insert(measures)
    .values({ partId: part.id, measure: parsedMeasure })
    .onConflictDoUpdate({
      target: measures.partId,
      set: {
        measure: parsedMeasure,
        baseline: null,
        latestValue: null,
        latestBreakdownValue: null,
        measuredAt: null,
      },
    })
}

// What a measure run read for a Part, and when.
export type Reading = {
  baseline: number
  latestValue: number
  latestBreakdownValue: string | null
  measuredAt: Date
}

export async function setReading(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  reading: Reading,
): Promise<void> {
  const part = await findPart(db, projectSlug, recordId)
  const { measures } = schema
  const measured = await db
    .update(measures)
    .set(reading)
    .where(eq(measures.partId, part.id))
    .returning({ partId: measures.partId })
  if (measured.length === 0)
    throw new InvalidRecordError(`"${recordId}" has no measure`)
}
