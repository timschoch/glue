import type { SQL } from 'drizzle-orm'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import { findMentions } from '../mention.ts'
import type { ConceptDb } from './client.ts'
import { getProjectId } from './concept.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import type { GoalMeasure } from './goal-measure.ts'
import { kinds } from './kinds.ts'
import type { Kind } from './kinds.ts'
import {
  listAnswers,
  answerRules,
  answers,
  NEW_PART_STATE,
  spreadTrust,
  stateOfStatus,
  toPublishedAt,
} from './part-trust.ts'
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
// none. The root takes the slug and the name of the Project. A Project
// without a name takes its slug as its name. Gives back the row id of the
// Project.
export async function addProject(
  db: ConceptDb,
  projectSlug: string,
  name = projectSlug,
): Promise<number> {
  const result = await db.execute(sql`
    with project as (
      insert into "projects" ("slug", "name")
      values (${projectSlug}::text, ${name}::text)
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
      workState: parts.workState,
      body: parts.body,
      // As text: a Date drops the microseconds.
      changedAt: sql<string>`${parts.changedAt}::text`,
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

// The record ids that the body names in its own Project (D37). A Joint glues
// two Parts of one Project, so a Part of another Project gets none.
function findMentionedRecordIds(projectSlug: string, body = '') {
  return findMentions(body)
    .filter(({ project }) => project === undefined || project === projectSlug)
    .map(({ recordId }) => recordId)
}

// The Parts that a body of a Part of the type glues it to: a query with
// their row id and their type. An id that the Project does not have gives no
// Part. A Decision has one Goal, so a mention gives it no Goal.
function selectMentionedParts(
  projectId: number,
  type: schema.PartType,
  recordIds: string[],
) {
  return sql`
    select "id", "type" from "parts"
    where "project_id" = ${projectId}::integer
      and ${recordIds.length === 0 ? sql`false` : sql`"record_id" in ${recordIds}`}
      ${type === 'decision' ? sql`and "type" <> 'goal'` : sql``}
  `
}

// What a superseded Decision gets: it is sunk and wrong, and it waits on
// nothing.
const supersededFields = sql`
  "status" = 'superseded',
  "trust" = 'wrong',
  "work_state" = 'sunk',
  "awaited_part_id" = null,
  "changed_at" = now()`

// The fields of a Part that spreadTrust reads after a write.
const trustFields = sql`"id", "title", "body", "trust", "work_state"`

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
  // The record ids that its body names: see findMentionedRecordIds.
  mentionedRecordIds?: string[]
  // The row id of the Decision that it supersedes.
  supersedesId?: number
  // The row id of the Decision that superseded it.
  supersededById?: number
  // The Signals that it grew from, in their order.
  signals?: { url: string; title: string }[]
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
  const { mentionedRecordIds = [], supersedesId, supersededById } = row
  const { signals = [] } = row
  const status = fields.status ?? (type === 'goal' ? 'open' : null)
  const { trust, workState } = stateOfStatus(type, status) ?? NEW_PART_STATE
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
  // The Joints go in by their position, so their ids keep the order. The
  // Joints of the mentions come after them. A Part that it needs and names
  // gets one Joint.
  const neededRows = neededPartIds.map(
    (neededPartId, position) =>
      sql`select ${position}::integer, ${neededPartId}::integer, false`,
  )
  const mentionedRows =
    mentionedRecordIds.length === 0
      ? []
      : [
          sql`
            select 0, "id", true
            from (${selectMentionedParts(projectId, type, mentionedRecordIds)})
              as mentioned_parts
            ${neededPartIds.length === 0 ? sql`` : sql`where "id" not in ${neededPartIds}`}
          `,
        ]
  const jointRows = [...neededRows, ...mentionedRows]
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
        "evidence_level", "superseded_by_id", "trust", "work_state",
        "published_at"
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
        ${supersededById ?? null}::integer,
        ${trust}::text,
        ${workState}::text,
        ${workState === 'published' ? sql`now()` : sql`null::timestamptz`}
      from counter
      returning "id", "record_id"
    )
    ${
      jointRows.length === 0
        ? sql``
        : sql`, added_joints as (
            insert into "joints" ("part_id", "needed_part_id", "mentioned")
            select added_part."id", needed."id", needed."mentioned"
            from added_part,
              (${sql.join(jointRows, sql` union all `)})
                as needed ("position", "id", "mentioned")
            order by needed."mentioned", needed."position", needed."id"
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
      signals.length === 0
        ? sql``
        : sql`, added_signals as (
            insert into "signals" ("project_id", "url", "title", "part_id")
            select ${projectId}::integer, grown."url", grown."title", added_part."id"
            from added_part,
              (${sql.join(
                signals.map(
                  ({ url, title }, position) =>
                    sql`select ${position}::integer, ${url}::text, ${title}::text`,
                ),
                sql` union all `,
              )}) as grown ("position", "url", "title")
            order by grown."position"
          )`
    }
    ${
      supersedesId === undefined
        ? sql``
        : sql`, superseded as (
            update "parts"
            set ${supersededFields},
              "superseded_by_id" = (select "id" from added_part)
            where "id" in (select "id" from gate)
            returning ${trustFields}
          )${spreadTrust('superseded')}`
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
    mentionedRecordIds: findMentionedRecordIds(projectSlug, fields.body),
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
    {
      projectId,
      conceptId,
      type: 'insight',
      fields,
      mentionedRecordIds: findMentionedRecordIds(projectSlug, fields.body),
    },
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

// Adds the draft Insight that grows from the Signals, and the Signals with
// it, as one statement: a failure must not leave the Insight without its
// Signals. Gives back its record id.
export async function addInsightOfSignals(
  db: ConceptDb,
  projectSlug: string,
  insight: z.input<typeof fieldSchemas.insight> & { concept?: string },
  signals: { url: string; title: string }[],
): Promise<string> {
  const { concept, ...inputFields } = insight
  const fields = parseInput(partSchemas.insight, {
    ...inputFields,
    status: 'draft',
  })
  const projectId = await getProjectId(db, projectSlug)
  const conceptId = await findConceptId(db, projectId, concept)
  const recordId = await addPartRow(db, {
    projectId,
    conceptId,
    type: 'insight',
    fields,
    mentionedRecordIds: findMentionedRecordIds(projectSlug, fields.body),
    signals,
  })
  return z.string().parse(recordId)
}

// The state that a guarded write expects of the Part. The statement holds
// it in its `where`. So of two requests at the same time, only the first
// one writes. The app sends the values that the person saw, so the change
// of a second person is not overwritten.
const expectedColumns = {
  title: schema.parts.title,
  body: schema.parts.body,
  owner: schema.parts.owner,
  status: schema.parts.status,
  date: schema.parts.date,
  source: schema.parts.source,
  metric: schema.parts.metric,
  enforcedBy: schema.parts.enforcedBy,
  evidenceLevel: schema.parts.evidenceLevel,
}

export const expectedPartSchema = z
  .strictObject({
    title: z.string(),
    body: z.string(),
    owner: z.string().nullable(),
    status: z.string().nullable(),
    date: z.string().nullable(),
    source: z.string().nullable(),
    metric: z.string().nullable(),
    enforcedBy: z.string().nullable(),
    evidenceLevel: z.string().nullable(),
  })
  .partial()

export type ExpectedPart = z.infer<typeof expectedPartSchema>

function isExpected(partId: number, expected: ExpectedPart) {
  const fields = Object.keys(expectedColumns) as (keyof ExpectedPart)[]
  return and(
    eq(schema.parts.id, partId),
    ...fields.map((field) =>
      expected[field] === undefined
        ? undefined
        : sql`${expectedColumns[field]}::text is not distinct from ${expected[field]}::text`,
    ),
  )
}

// Sets the fields that the change names, and the measure with them as one
// statement. A superseded Decision that gets another status has no successor
// any more. A new status moves the Trust and the Work state with it, and
// the change travels to the Parts that need this one: see spreadTrust. A new
// body glues the Part to each Part that it names, and removes the Joint of a
// mention that is gone (D37). A Joint that a person added stays, and so does
// the last evidence of a Decision. false: the Part was not in the expected
// state, and nothing changed.
export async function updatePart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  change: PartChange,
  expected: ExpectedPart = {},
): Promise<boolean> {
  const projectId = await getProjectId(db, projectSlug)
  const [part] = await findParts(db, projectId, [recordId])
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
  const moved =
    columns.status === undefined
      ? undefined
      : stateOfStatus(part.type, columns.status)
  // The same status again moves nothing: a flagged Part stays flagged.
  const hasNewStatus = sql`${parts.status} is distinct from ${columns.status ?? null}::text`
  const changedFields = {
    id: parts.id,
    title: parts.title,
    body: parts.body,
    trust: parts.trust,
    workState: parts.workState,
  }
  const changed = hasColumns
    ? db
        .update(parts)
        .set({
          ...columns,
          ...(part.type === 'decision' &&
            columns.status !== undefined && { supersededById: null }),
          ...(moved && {
            trust: sql`case when ${hasNewStatus} then ${moved.trust}::text else ${parts.trust} end`,
            workState: sql`case when ${hasNewStatus} then ${moved.workState}::text else ${parts.workState} end`,
            awaitedPartId: sql`case when ${hasNewStatus} then null else ${parts.awaitedPartId} end`,
            publishedAt: sql`case when ${hasNewStatus} then ${toPublishedAt(moved.workState)} else "published_at" end`,
          }),
          changedAt: sql`now()`,
        })
        .where(matches)
        .returning(changedFields)
    : db.select(changedFields).from(parts).where(matches)
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
  const mentionedParts = selectMentionedParts(
    projectId,
    part.type,
    findMentionedRecordIds(projectSlug, columns.body).filter(
      (mentionedRecordId) => mentionedRecordId !== recordId,
    ),
  )
  const keepsEvidence = sql`and (
    "needed_part_id" not in (
      select "id" from "parts" where "type" in ${evidenceTypes}
    )
    or exists (
      select 1 from mentioned_parts where "type" in ${evidenceTypes}
    )
    or exists (
      select 1 from "joints" as other, "parts" as evidence
      where other."part_id" = ${part.id}::integer
        and not other."mentioned"
        and evidence."id" = other."needed_part_id"
        and evidence."type" in ${evidenceTypes}
    )
  )`
  const changedJoints = sql`, mentioned_parts as (${mentionedParts}),
    removed_joints as (
      delete from "joints"
      where "part_id" in (select "id" from changed)
        and "mentioned"
        and "needed_part_id" not in (select "id" from mentioned_parts)
        ${part.type === 'decision' ? keepsEvidence : sql``}
    ),
    added_joints as (
      insert into "joints" ("part_id", "needed_part_id", "mentioned")
      select changed."id", mentioned_parts."id", true
      from changed, mentioned_parts
      order by mentioned_parts."id"
      on conflict do nothing
    )`
  const result = await db.execute(sql`
    with changed as ${changed}
    ${hasColumns ? spreadTrust('changed') : sql``}
    ${nextMeasure === undefined ? sql`` : changedMeasure}
    ${columns.body === undefined ? sql`` : changedJoints}
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
// another Part needs stays. A Part that waits on it is back in to-check.
// false: a Part needs it, or it was not in the expected state, and nothing
// changed.
export async function removePart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  expected: ExpectedPart = {},
): Promise<boolean> {
  const part = await getPart(db, projectSlug, recordId)
  const { parts } = schema
  const removed = db
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
  const result = await db.execute(sql`
    with removed as ${removed},
    woken as (
      update "parts" set
        "work_state" = 'to-check',
        "awaited_part_id" = null,
        "changed_at" = now()
      where "awaited_part_id" in (select "id" from removed)
    )
    select "id" from removed
  `)
  return idRowsSchema.parse(result).rows.length > 0
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
// direction. The Joint of a mention between the two Parts becomes the Joint
// that the person adds, so it stays when the mention goes.
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
    on conflict (
      least("part_id", "needed_part_id"),
      greatest("part_id", "needed_part_id")
    )
    do update set
      "part_id" = excluded."part_id",
      "needed_part_id" = excluded."needed_part_id",
      "two_way" = excluded."two_way",
      "mentioned" = false
    where "joints"."mentioned"
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
    ),
    superseded as (
      update "parts"
      set ${supersededFields}, "superseded_by_id" = ${successor.id}::integer
      where "id" = ${decision.id}::integer
        and (
          select "status" from locked where "id" = ${decision.id}::integer
        ) <> 'superseded'
        and (
          select "status" from locked where "id" = ${successor.id}::integer
        ) = 'accepted'
      returning ${trustFields}
    )${spreadTrust('superseded')}
    select "id" from superseded
  `)
  if (idRowsSchema.parse(result).rows.length > 0) return

  const now = await findDecision(db, projectId, recordId)
  throw now.status === 'superseded'
    ? new InvalidRecordError(`"${recordId}" is superseded already`)
    : toNotAcceptedError()
}

// An answer of the owner to a Part, as a request sends it. `wait` names the
// Part that it waits on.
// `words` is an answer in words: it goes to the end of the body, with the
// name `by` and the date (D27).
const answerWords = {
  words: text.optional().meta({
    description:
      'An answer in words. It goes to the end of the body with the name and the date',
  }),
  by: text
    .optional()
    .meta({ description: 'The name of the person who answers in words' }),
}

export const partAnswerSchema = z.discriminatedUnion('answer', [
  z.strictObject({
    answer: z.enum(answers).exclude(['wait']),
    ...answerWords,
  }),
  z.strictObject({
    answer: z.literal('wait'),
    waitsOn: z
      .string()
      .meta({ description: 'The record id of the awaited Part' }),
    ...answerWords,
  }),
])

export type PartAnswer = z.input<typeof partAnswerSchema>

// Reads an answer from the arguments of the CLI.
export function parsePartAnswer(input: unknown): PartAnswer {
  return parseInput(partAnswerSchema, input)
}

// Answers a Part as its owner: one write that sets its Trust, its Work state
// and its status as the answer says (D39, and the table in docs/concept.md),
// closes its open flags, and tells the Parts that need it. `wait` keeps the
// flags. An answer in words goes to the end of the body in the same write.
// The Work state of the Part must take the answer. The statement asks for
// the Part as it was read: an answer to a Part that another write changed
// in between writes nothing, so it closes no flag that the owner did
// not see, and of two answers at the same time only the first one writes.
// `wait` locks the awaited Part and asks that it is not sunk.
export async function answerPart(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
  input: PartAnswer,
): Promise<void> {
  const given = parseInput(partAnswerSchema, input)
  const projectId = await getProjectId(db, projectSlug)
  const [part] = await findParts(db, projectId, [recordId])
  const allowed = listAnswers(part.workState)
  if (!allowed.includes(given.answer))
    throw new InvalidRecordError(
      allowed.length === 0
        ? `"${recordId}" is ${part.workState}: it takes no answer`
        : `"${recordId}" is ${part.workState}: it takes the answers ${allowed.join(', ')}`,
    )

  if (given.words !== undefined && given.by === undefined)
    throw new InvalidRecordError(
      '"words" needs "by": the name of the person who answers',
    )
  const body =
    given.words === undefined
      ? undefined
      : [part.body, `${given.by}, ${todayUtc()}: ${given.words}`]
          .filter(Boolean)
          .join('\n\n')

  const waitsOn = given.answer === 'wait' ? given.waitsOn : undefined
  if (waitsOn === recordId)
    throw new InvalidRecordError('a Part cannot wait on itself')
  const awaited =
    waitsOn === undefined
      ? undefined
      : (await findParts(db, projectId, [waitsOn]))[0]

  const rule = answerRules[given.answer]
  const statuses: Partial<Record<schema.PartType, string | null>> = {
    decision: rule.decisionStatus,
    insight: rule.insightStatus,
  }
  const status = statuses[part.type]
  const result = await db.execute(sql`
    with awaited as (
      select "id" from "parts"
      where "id" = ${awaited?.id ?? null}::integer and "work_state" <> 'sunk'
      for share
    ),
    answered as (
      update "parts" set
        "trust" = ${rule.trust === undefined ? sql`"trust"` : sql`${rule.trust}::text`},
        "work_state" = ${rule.workState}::text,
        "awaited_part_id" = (select "id" from awaited),
        ${status === undefined ? sql`` : sql`"status" = ${status}::text,`}
        ${body === undefined ? sql`` : sql`"body" = ${body}::text,`}
        "published_at" = ${toPublishedAt(rule.workState)},
        "changed_at" = now()
      where "id" = ${part.id}::integer
        and "changed_at" = ${part.changedAt}::timestamptz
        ${awaited === undefined ? sql`` : sql`and exists (select 1 from awaited)`}
      returning ${trustFields}
    )${spreadTrust('answered', sql`${rule.closesFlags}::boolean`)}
    select "id" from answered
  `)
  if (idRowsSchema.parse(result).rows.length > 0) return

  if (waitsOn !== undefined) {
    const [now] = await findParts(db, projectId, [waitsOn])
    if (now.workState === 'sunk')
      throw new InvalidRecordError(`"${waitsOn}" is sunk`)
  }
  throw new InvalidRecordError(
    `"${recordId}" changed at the same time: read it and answer again`,
  )
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
