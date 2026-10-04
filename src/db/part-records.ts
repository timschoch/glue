import type { SQL } from 'drizzle-orm'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { getProjectId } from './concept.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import type { GoalMeasure } from './goal-measure.ts'
import { kinds } from './kinds.ts'
import type { Kind } from './kinds.ts'
import {
  InvalidRecordError,
  isUniqueViolation,
  JointNotFoundError,
} from './record-errors.ts'
import { RECORD_LETTERS, typeOfRecordId } from './record-id.ts'
import * as schema from './schema.ts'

// The write side of the Part model.
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

// The rows of a statement that gives back the row id of what it wrote.
const idRowsSchema = z.object({ rows: z.array(z.object({ id: z.number() })) })

// Adds the Project when it does not exist, and its root Concept when it has
// none. The root takes the slug and the name of the Project. Gives back the
// row id of the Project.
export async function addProject(
  db: ConceptDb,
  projectSlug: string,
): Promise<number> {
  const result = await db.execute(sql`
    with project as (
      insert into "projects" ("slug", "name")
      values (${projectSlug}::text, ${projectSlug}::text)
      on conflict ("slug") do update set "slug" = excluded."slug"
      returning "id", "slug", "name"
    ),
    root as (
      insert into "concepts" ("project_id", "slug", "title")
      select "id", "slug", "name" from project
      on conflict ("project_id") where "parent_id" is null do nothing
    )
    select "id" from project
  `)
  return idRowsSchema.parse(result).rows[0].id
}

export const newConceptSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    error: 'a slug is lowercase words joined by hyphens',
  }),
  title: text,
  kind: z.literal(Object.keys(kinds) as Kind[]).optional(),
  parent: z.string().optional().meta({
    description: 'The slug of the Concept that holds it. Default: the root',
  }),
})

export type NewConcept = z.input<typeof newConceptSchema>

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
  const { slug, title, kind, parent } = parseInput(newConceptSchema, concept)
  const projectId = await getProjectId(db, projectSlug)
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

const date = z.iso.date()

const commonFields = {
  title: text,
  body: z.string().optional(),
  owner: text.nullable().optional(),
  source: text.nullable().optional(),
}

const plainSchema = z.strictObject(commonFields)

// How Glue measures a Goal or a Metric. It goes in with the Part, as one
// statement.
const measure = goalMeasureSchema.optional()

// A new measure reads another metric, so it removes the readings. null:
// Glue stops measuring the Part.
const measureChange = { measure: goalMeasureSchema.nullable().optional() }

// The fields of each Part type. The check `parts_type_fields_check` holds
// the same rules. A Decision is superseded only with its successor: see
// `supersededBy` in placeSchema. No request sets the issue of a Decision:
// see setIssueUrl.
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
    measure,
  }),
  decision: z.strictObject({
    ...commonFields,
    owner: text,
    date: date.optional(),
    status: z.enum(schema.decisionStatuses),
  }),
  guardrail: z.strictObject({ ...commonFields, enforcedBy: text }),
  entity: plainSchema,
  flow: plainSchema,
  metric: z.strictObject({ ...commonFields, measure }),
}

// A Decision that exists becomes superseded through supersedeDecision, so
// that status is not a value of a change.
const changeSchemas = {
  insight: fieldSchemas.insight.partial(),
  goal: fieldSchemas.goal.partial().extend(measureChange),
  decision: fieldSchemas.decision
    .partial()
    .extend({ status: z.enum(['proposed', 'accepted']).optional() }),
  guardrail: fieldSchemas.guardrail.partial(),
  entity: plainSchema.partial(),
  flow: plainSchema.partial(),
  metric: fieldSchemas.metric.partial().extend(measureChange),
}

// The fields of all types as one shape: what a row of `parts` takes, and
// the measure of the Part.
type PartFields = {
  title: string
  body?: string
  owner?: string | null
  source?: string | null
  status?: string | null
  date?: string
  metric?: string
  enforcedBy?: string
  evidenceLevel?: schema.EvidenceLevel | null
  measure?: GoalMeasure | null
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
  supersededBy: z.string().optional().meta({
    description:
      'The record id of the Decision that replaced it. It goes with the status superseded',
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

const placeShape = placeSchema.omit({ type: true }).shape

// A new Part as a request sends it: its type, its place and the fields of
// its type.
export const newPartSchema = z.discriminatedUnion('type', [
  fieldSchemas.insight.extend({ type: z.literal('insight'), ...placeShape }),
  fieldSchemas.goal.extend({ type: z.literal('goal'), ...placeShape }),
  fieldSchemas.decision.extend({ type: z.literal('decision'), ...placeShape }),
  fieldSchemas.guardrail.extend({
    type: z.literal('guardrail'),
    ...placeShape,
  }),
  fieldSchemas.entity.extend({ type: z.literal('entity'), ...placeShape }),
  fieldSchemas.flow.extend({ type: z.literal('flow'), ...placeShape }),
  fieldSchemas.metric.extend({ type: z.literal('metric'), ...placeShape }),
])

// Reads a new Part from the flags of the CLI.
export function parseNewPart(input: unknown): NewPart {
  return parseInput(newPartSchema, input)
}

// A change of a Part as a request sends it. updatePart reads it with the
// schema of the type of the Part.
export const partChangeSchema = z.union(Object.values(changeSchemas))

// Reads the change of a Part of the type from a request.
export function parsePartChange(
  type: schema.PartType,
  input: unknown,
): PartChange {
  return parseInput(changeSchemas[type], input)
}

// The letter of a record id names the type, so the error names it too.
function toNotFoundError(recordId: string) {
  const type = typeOfRecordId(recordId)
  return new InvalidRecordError(
    type ? `${type} "${recordId}" not found` : `"${recordId}" not found`,
  )
}

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
    if (!part) throw toNotFoundError(recordId)
    return part
  })
}

async function getPart(db: ConceptDb, projectSlug: string, recordId: string) {
  const projectId = await getProjectId(db, projectSlug)
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

const evidenceTypes: readonly schema.PartType[] = schema.evidenceTypes

export function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

const addedPartSchema = z.object({
  rows: z.array(z.object({ record_id: z.string() })),
})

// A row of `parts`, with what goes in with it as one statement.
type PartRow = {
  projectId: number
  conceptId: number
  type: schema.PartType
  fields: PartFields
  // The row ids of the Parts that it needs, in the order of their Joints.
  neededPartIds?: number[]
  // The row id of the Decision that it supersedes.
  supersedesId?: number
  // The row id of the Decision that superseded it.
  supersededById?: number
}

// Adds the Part, and gives back its record id. `gate` is a common table
// expression with the name "gate": the Part goes in only when the gate gives
// a row. null: the gate gave no row, and nothing changed.
async function addPartRow(
  db: ConceptDb,
  row: PartRow,
  gate?: SQL,
): Promise<string | null> {
  const { projectId, conceptId, type, fields, neededPartIds = [] } = row
  const { supersedesId, supersededById } = row
  const status = fields.status ?? (type === 'goal' ? 'open' : null)
  const isDated = type === 'decision' || type === 'insight'

  // The statement locks the Decision that it supersedes and adds nothing
  // when that Decision is superseded already. Thus the second of two
  // requests that supersede the same Decision changes nothing.
  const partGate =
    supersedesId === undefined
      ? gate
      : sql`gate as (
          select "id" from "parts"
          where "id" = ${supersedesId}::integer and "status" <> 'superseded'
          for update
        )`
  // The Joints go in by their position, so their ids keep the order.
  const neededValues = sql.join(
    neededPartIds.map(
      (neededPartId, position) =>
        sql`(${position}::integer, ${neededPartId}::integer)`,
    ),
    sql`, `,
  )
  // The counter only grows, so the id of a deleted Part does not come back,
  // and two statements never read the same number. A row that went in
  // without the counter can have a higher number. Thus the step starts from
  // the higher of the counter and the highest id.
  const statement = sql`
    with ${partGate === undefined ? sql`` : sql`${partGate},`}
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
      ${partGate === undefined ? sql`` : sql`from gate`}
      on conflict ("project_id", "type")
      do update set "last_number" =
        greatest("part_counters"."last_number", excluded."last_number" - 1) + 1
      returning "last_number"
    ),
    added_part as (
      insert into "parts" (
        "project_id", "concept_id", "type", "record_id", "title", "body",
        "owner", "status", "date", "source", "metric", "enforced_by",
        "evidence_level", "superseded_by_id"
      )
      select
        ${projectId}::integer,
        ${conceptId}::integer,
        ${type}::text,
        ${RECORD_LETTERS[type]}::text || "last_number",
        ${fields.title}::text,
        ${fields.body ?? ''}::text,
        ${fields.owner ?? null}::text,
        ${status}::text,
        ${fields.date ?? (isDated ? todayUtc() : null)}::date,
        ${fields.source ?? null}::text,
        ${fields.metric ?? null}::text,
        ${fields.enforcedBy ?? null}::text,
        ${fields.evidenceLevel ?? null}::text,
        ${supersededById ?? null}::integer
      from counter
      returning "id", "record_id"
    )
    ${
      neededPartIds.length === 0
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
      fields.measure
        ? sql`, added_measure as (
            insert into "measures" ("part_id", "measure")
            select "id", ${JSON.stringify(fields.measure)}::jsonb
            from added_part
          )`
        : sql``
    }
    ${
      supersedesId === undefined
        ? sql``
        : sql`, superseded as (
            update "parts"
            set "status" = 'superseded',
              "superseded_by_id" = (select "id" from added_part)
            where "id" in (select "id" from gate)
          )`
    }
    select "record_id" from added_part
  `

  // The measure run writes one Insight per query. The unique index refuses
  // the second one, also when two runs overlap.
  const result = await db.execute(statement).catch((error: unknown) => {
    if (isUniqueViolation(error, 'parts_measure_source_unique'))
      throw new InvalidRecordError(
        `an Insight with the source "${fields.source}" exists already`,
      )
    throw error
  })
  return addedPartSchema.parse(result).rows.at(0)?.record_id ?? null
}

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
    supersededBy,
  } = parseInput(placeSchema, part)
  const {
    type: _type,
    concept: _concept,
    needs: _needs,
    supersedes: _supersedes,
    supersededBy: _supersededBy,
    ...inputFields
  } = part
  const fields = parseInput(partSchemas[type], inputFields)
  if ((supersedes ?? supersededBy) !== undefined && type !== 'decision')
    throw new InvalidRecordError('only a Decision supersedes')
  if (supersedes !== undefined && fields.status !== 'accepted')
    throw new InvalidRecordError('"supersedes" needs the status "accepted"')
  if ((fields.status === 'superseded') !== (supersededBy !== undefined))
    throw new InvalidRecordError(
      'the status "superseded" and "supersededBy" go together',
    )

  const projectId = await getProjectId(db, projectSlug)
  const conceptId = await findConceptId(db, projectId, concept)
  const neededParts = await findParts(db, projectId, [...new Set(needs)])
  if (type === 'decision') {
    const goals = neededParts.filter((needed) => needed.type === 'goal')
    if (goals.length === 0)
      throw new InvalidRecordError('a Decision needs a Goal')
    if (goals.length > 1)
      throw new InvalidRecordError('a Decision needs one Goal')
    if (!neededParts.some((needed) => evidenceTypes.includes(needed.type)))
      throw new InvalidRecordError(
        'a Decision needs evidence: an Insight or a Guardrail',
      )
  }
  const supersedesId =
    supersedes === undefined
      ? undefined
      : (await findDecision(db, projectId, supersedes)).id
  const successor =
    supersededBy === undefined
      ? undefined
      : await findDecision(db, projectId, supersededBy)
  if (successor && successor.status !== 'accepted')
    throw new InvalidRecordError(`"${supersededBy}" is not accepted`)

  const recordId = await addPartRow(db, {
    projectId,
    conceptId,
    type,
    fields,
    neededPartIds: neededParts.map((needed) => needed.id),
    supersedesId,
    supersededById: successor?.id,
  })
  if (recordId === null)
    throw new InvalidRecordError(`"${supersedes}" is superseded already`)
  return recordId
}

// Moves the comment read position of the Project from `read.from` to
// `read.until` and adds the draft Insight about those comments, as one
// statement: a network failure must not move the position without the
// Insight. null when an overlapping run moved the position first: then
// nothing is added.
export async function addCommentInsight(
  db: ConceptDb,
  projectSlug: string,
  read: { from: Date | null; until: Date },
  insight: { title: string; source: string; date: string; body: string },
): Promise<string | null> {
  const fields = parseInput(partSchemas.insight, {
    ...insight,
    status: 'draft',
  })
  const projectId = await getProjectId(db, projectSlug)
  const conceptId = await findConceptId(db, projectId, undefined)
  return addPartRow(
    db,
    { projectId, conceptId, type: 'insight', fields },
    sql`gate as (
      update "projects"
      set "comments_read_until" = ${read.until.toISOString()}::timestamptz
      where "id" = ${projectId}::integer
        and "comments_read_until" is not distinct from
          ${read.from?.toISOString() ?? null}::timestamptz
      returning "id"
    )`,
  )
}

// The state that a guarded write expects of the Part. The statement holds
// it in its `where`. So of two requests at the same time, only the first
// one writes.
export type ExpectedPart = { status?: string | null }

function isExpected(partId: number, expected: ExpectedPart) {
  const { parts } = schema
  return and(
    eq(parts.id, partId),
    expected.status === undefined
      ? undefined
      : sql`${parts.status} is not distinct from ${expected.status}::text`,
  )
}

// Sets the fields that the change names, and the measure with them as one
// statement. A superseded Decision that gets another status has no successor
// any more. false: the Part was not in the expected state, and nothing
// changed.
export async function updatePart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  change: PartChange,
  expected: ExpectedPart = {},
): Promise<boolean> {
  const part = await getPart(db, projectSlug, recordId)
  const { measure: nextMeasure, ...columns } = parseInput(
    partChangeSchemas[part.type],
    change,
  )
  const values: unknown[] = Object.values(columns)
  const hasColumns = values.some((value) => value !== undefined)
  if (!hasColumns && nextMeasure === undefined)
    throw new InvalidRecordError('send at least one field')

  const { parts } = schema
  const matches = isExpected(part.id, expected)
  const changed = hasColumns
    ? db
        .update(parts)
        .set({
          ...columns,
          ...(part.type === 'decision' &&
            columns.status !== undefined && { supersededById: null }),
        })
        .where(matches)
        .returning({ id: parts.id })
    : db.select({ id: parts.id }).from(parts).where(matches)
  const changedMeasure =
    nextMeasure === null
      ? sql`, removed_measure as (
          delete from "measures"
          where "part_id" in (select "id" from changed)
        )`
      : sql`, changed_measure as (
          insert into "measures" ("part_id", "measure")
          select "id", ${JSON.stringify(nextMeasure)}::jsonb from changed
          on conflict ("part_id") do update set
            "measure" = excluded."measure",
            "baseline" = null,
            "latest_value" = null,
            "latest_breakdown_value" = null,
            "measured_at" = null
        )`
  const result = await db.execute(sql`
    with changed as ${changed}
    ${nextMeasure === undefined ? sql`` : changedMeasure}
    select "id" from changed
  `)
  return idRowsSchema.parse(result).rows.length > 0
}

// Keeps the issue that Glue opened for the Decision. Only Glue calls it: a
// request cannot set the issue. A Decision with an issue keeps it. false:
// it has one already, and nothing changed.
export async function setIssueUrl(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  issueUrl: string,
): Promise<boolean> {
  const projectId = await getProjectId(db, projectSlug)
  const decision = await findDecision(db, projectId, recordId)
  const { parts } = schema
  const changed = await db
    .update(parts)
    .set({ issueUrl })
    .where(and(eq(parts.id, decision.id), isNull(parts.issueUrl)))
    .returning({ id: parts.id })
  return changed.length > 0
}

// Removes the Part, with the Joints to the Parts that it needs. A Part that
// another Part needs stays. false: a Part needs it, or it was not in the
// expected state, and nothing changed.
export async function removePart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  expected: ExpectedPart = {},
): Promise<boolean> {
  const part = await getPart(db, projectSlug, recordId)
  const { parts } = schema
  const removed = await db
    .delete(parts)
    .where(
      and(
        isExpected(part.id, expected),
        sql`not exists (
          select 1 from "joints" where "needed_part_id" = ${parts.id}
        )`,
      ),
    )
    .returning({ id: parts.id })
  return removed.length > 0
}

export const newJointSchema = z.strictObject({
  part: z
    .string()
    .meta({ description: 'The record id of the Part that needs' }),
  needs: z.string().meta({ description: 'The record id of the needed Part' }),
  twoWay: z.boolean().optional(),
})

export type NewJoint = z.input<typeof newJointSchema>

// Glues two Parts of the Project, and gives back the id of the Joint. Parts
// with different home Concepts make a link: the same Joint, never a copy.
// A Decision has one Goal, so the statement adds no second one. A two-way
// Joint shows on both sides, so it gives the Decision a Goal in either
// direction.
export async function addJoint(
  db: ConceptDb,
  projectSlug: string,
  joint: NewJoint,
): Promise<number> {
  const { part, needs, twoWay = false } = parseInput(newJointSchema, joint)
  if (part === needs) throw new InvalidRecordError('a Part cannot need itself')
  const projectId = await getProjectId(db, projectSlug)
  const [needingPart, neededPart] = await findParts(db, projectId, [
    part,
    needs,
  ])
  const ends = [
    [needingPart, neededPart],
    ...(twoWay ? [[neededPart, needingPart]] : []),
  ]
  // The Decision that gets a Goal from the Joint.
  const decision = ends.find(
    ([from, to]) => from.type === 'decision' && to.type === 'goal',
  )?.[0]
  const hasNoGoal = sql`where not exists (
    select 1 from "joints" as other, "parts" as goal
    where goal."type" = 'goal'
      and (
        (
          other."part_id" = ${decision?.id}::integer
          and other."needed_part_id" = goal."id"
        )
        or (
          other."two_way"
          and other."needed_part_id" = ${decision?.id}::integer
          and other."part_id" = goal."id"
        )
      )
  )`
  const result = await db.execute(sql`
    insert into "joints" ("part_id", "needed_part_id", "two_way")
    select
      ${needingPart.id}::integer,
      ${neededPart.id}::integer,
      ${twoWay}::boolean
    ${decision ? hasNoGoal : sql``}
    on conflict do nothing
    returning "id"
  `)
  const added = idRowsSchema.parse(result).rows
  if (added.length === 0)
    throw new InvalidRecordError(
      decision
        ? `"${decision.recordId}" has a Goal already`
        : `"${part}" and "${needs}" have a Joint already`,
    )
  return added[0].id
}

const decisionNeedTypes = ['goal', ...schema.evidenceTypes]

// Removes the Joint, but not the last Goal and not the last evidence that a
// Decision needs: addPart refuses a Decision without them. The statement
// locks all Joints of the Part that needs, in the order of their ids. So of
// two requests that remove the last two at the same time, the second one
// sees that the first Joint is gone.
export async function removeJoint(
  db: ConceptDb,
  projectSlug: string,
  jointId: number,
): Promise<void> {
  const projectId = await getProjectId(db, projectSlug)
  const result = await db.execute(sql`
    with locked as (
      select
        joint."id",
        part."type" as "part_type",
        needed."type" as "needed_type"
      from "joints" as joint
      join "parts" as part on part."id" = joint."part_id"
      join "parts" as needed on needed."id" = joint."needed_part_id"
      where part."project_id" = ${projectId}::integer
        and joint."part_id" = (
          select "part_id" from "joints" where "id" = ${jointId}::integer
        )
      order by joint."id"
      for update of joint
    )
    delete from "joints"
    where "id" = (
      select target."id" from locked as target
      where target."id" = ${jointId}::integer
        and not (
          target."part_type" = 'decision'
          and target."needed_type" in ${decisionNeedTypes}
          and not exists (
            select 1 from locked as other
            where other."id" <> target."id"
              and other."needed_type" in ${decisionNeedTypes}
              and (other."needed_type" = 'goal')
                = (target."needed_type" = 'goal')
          )
        )
    )
    returning "id"
  `)
  if (idRowsSchema.parse(result).rows.length > 0) return

  const { joints, parts } = schema
  const found = await db
    .select({ id: joints.id })
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .where(and(eq(joints.id, jointId), eq(parts.projectId, projectId)))
  if (found.length === 0) throw new JointNotFoundError(jointId)
  throw new InvalidRecordError(
    `a Decision needs a Goal and evidence: joint ${jointId} is its last one`,
  )
}

// Replaces a Decision with an accepted one. The old Decision keeps its
// record id and points to its successor. The statement locks both Decisions
// in the order of their ids, and asks for a Decision that is not superseded
// and for a successor that is accepted. So a Decision keeps its first
// successor, and two Decisions never supersede each other.
export async function supersedeDecision(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  supersededByRecordId: string,
): Promise<void> {
  if (recordId === supersededByRecordId)
    throw new InvalidRecordError('a Decision cannot supersede itself')
  const projectId = await getProjectId(db, projectSlug)
  const decision = await findDecision(db, projectId, recordId)
  const successor = await findDecision(db, projectId, supersededByRecordId)
  const toNotAcceptedError = () =>
    new InvalidRecordError(`"${supersededByRecordId}" is not accepted`)
  if (successor.status !== 'accepted') throw toNotAcceptedError()

  const result = await db.execute(sql`
    with locked as (
      select "id", "status" from "parts"
      where "id" in (${decision.id}::integer, ${successor.id}::integer)
      order by "id"
      for update
    )
    update "parts"
    set "status" = 'superseded', "superseded_by_id" = ${successor.id}::integer
    where "id" = ${decision.id}::integer
      and (
        select "status" from locked where "id" = ${decision.id}::integer
      ) <> 'superseded'
      and (
        select "status" from locked where "id" = ${successor.id}::integer
      ) = 'accepted'
    returning "id"
  `)
  if (idRowsSchema.parse(result).rows.length > 0) return

  const now = await findDecision(db, projectId, recordId)
  throw now.status === 'superseded'
    ? new InvalidRecordError(`"${recordId}" is superseded already`)
    : toNotAcceptedError()
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
  const part = await getPart(db, projectSlug, recordId)
  const { measures } = schema
  const measured = await db
    .update(measures)
    .set(reading)
    .where(eq(measures.partId, part.id))
    .returning({ partId: measures.partId })
  if (measured.length === 0)
    throw new InvalidRecordError(`"${recordId}" has no measure`)
}
