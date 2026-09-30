import { and, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { GithubClient } from '../github/client.ts'
import { createDownstreamIssue } from '../github/downstream-issue.ts'
import type { DownstreamIssue } from '../github/downstream-issue.ts'
import { CONCEPT_FIELDS } from './concept-fields.ts'
import type { ConceptDb } from './client.ts'
import { sortById } from './concept.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import type { GoalMeasure } from './goal-measure.ts'
import * as schema from './schema.ts'

export type ConceptFolder = keyof typeof CONCEPT_FIELDS

// A record breaks a rule: a missing field, or a link to a record that does
// not exist. The HTTP API answers it with 400.
export class InvalidRecordError extends Error {}

// The Product of the request does not exist. The HTTP API answers it with 404.
export class ProductNotFoundError extends InvalidRecordError {
  constructor(productSlug: string) {
    super(`product "${productSlug}" not found`)
  }
}

export type ConceptFields = Record<
  string,
  string | string[] | GoalMeasure | undefined
>

const FOLDER_TABLES = {
  goals: schema.goals,
  decisions: schema.decisions,
  insights: schema.insights,
  facts: schema.facts,
  guardrails: schema.guardrails,
} as const

const FOLDER_BY_PREFIX = Object.fromEntries(
  Object.entries(CONCEPT_FIELDS).map(([folder, type]) => [type.prefix, folder]),
) as Partial<Record<string, ConceptFolder>>

function folderForId(id: string): ConceptFolder {
  const folder = FOLDER_BY_PREFIX[id[0]]
  if (!folder) throw new Error(`"${id}" is not a Concept id`)
  return folder
}

async function findProductId(db: ConceptDb, productSlug: string) {
  const products = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.slug, productSlug))
  if (products.length === 0) throw new ProductNotFoundError(productSlug)
  return products[0].id
}

export async function addProductId(db: ConceptDb, productSlug: string) {
  const [product] = await db
    .insert(schema.products)
    .values({ slug: productSlug, name: productSlug })
    .onConflictDoUpdate({
      target: schema.products.slug,
      set: { slug: productSlug },
    })
    .returning({ id: schema.products.id })
  return product.id
}

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/

export async function setProductRepository(
  db: ConceptDb,
  productSlug: string,
  repository: string,
): Promise<void> {
  if (!REPOSITORY.test(repository)) {
    throw new InvalidRecordError(
      `repository "${repository}" must look like owner/name`,
    )
  }
  const updated = await db
    .update(schema.products)
    .set({ repository })
    .where(eq(schema.products.slug, productSlug))
    .returning({ id: schema.products.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// The number after the highest number that a record id of the folder has
// now. D19 is higher than D9, so the number decides, not the text.
function numberAfterHighestId(productId: number, folder: ConceptFolder) {
  return sql`(
    select coalesce(max(substring("record_id" from 2)::integer), 0) + 1
    from ${sql.identifier(folder)}
    where "product_id" = ${productId}::integer and "record_id" ~ '^[A-Z][0-9]+$'
  )`
}

// The counter of a folder after the step to its next number. Older code adds
// a record with the highest id plus 1 and does not move the counter. Thus
// the step starts from the higher of the counter and the highest id.
const NEXT_COUNTER_NUMBER = sql`greatest("record_counters"."last_number", excluded."last_number" - 1) + 1`

// The next id of the folder, as a part of the statement that adds the
// record. The counter only grows, so the id of a discarded record does not
// come back, and two statements never read the same number.
function nextRecordId(db: ConceptDb, productId: number, folder: ConceptFolder) {
  const { recordCounters } = schema
  const counter = db.$with('counter').as(
    db
      .insert(recordCounters)
      .values({
        productId,
        folder,
        lastNumber: numberAfterHighestId(productId, folder),
      })
      .onConflictDoUpdate({
        target: [recordCounters.productId, recordCounters.folder],
        set: { lastNumber: NEXT_COUNTER_NUMBER },
      })
      .returning({ lastNumber: recordCounters.lastNumber }),
  )
  const prefix = CONCEPT_FIELDS[folder].prefix
  return {
    counter,
    recordId: sql<string>`${prefix}::text || (select last_number from ${counter})`,
  }
}

export type ConceptListRow = { id: string; status: string; title: string }

export async function listConceptRecords(
  db: ConceptDb,
  productSlug: string,
  folder?: ConceptFolder,
): Promise<ConceptListRow[]> {
  const productId = await findProductId(db, productSlug)
  const folders = folder
    ? [folder]
    : (Object.keys(CONCEPT_FIELDS) as ConceptFolder[])
  const rows: ConceptListRow[] = []
  for (const currentFolder of folders) {
    const table = FOLDER_TABLES[currentFolder]
    const records = await db
      .select()
      .from(table)
      .where(eq(table.productId, productId))
    const folderRows = (records as Record<string, unknown>[]).map((record) => ({
      id: record.recordId as string,
      status: 'status' in record ? String(record.status ?? '') : '',
      title: record.title as string,
    }))
    rows.push(...sortById(folderRows))
  }
  return rows
}

export type ConceptShowResult = {
  id: string
  folder: ConceptFolder
  fields: Record<string, unknown>
  body: string
  goal?: { id: string; title: string }
  evidence?: { id: string; title: string }[]
  supersededBy?: string
  supersedes?: string[]
}

export async function showConceptRecord(
  db: ConceptDb,
  productSlug: string,
  id: string,
): Promise<ConceptShowResult> {
  const productId = await findProductId(db, productSlug)
  const folder = folderForId(id)
  const table = FOLDER_TABLES[folder]
  const records = await db
    .select()
    .from(table)
    .where(and(eq(table.productId, productId), eq(table.recordId, id)))
  if (records.length === 0) throw new Error(`"${id}" not found`)
  const [record] = records

  if (folder !== 'decisions') {
    const {
      productId: _productId,
      recordId,
      id: _id,
      body,
      ...fields
    } = record as Record<string, unknown>
    return {
      id: recordId as string,
      folder,
      fields,
      body: body as string,
    }
  }

  const decisionRow = record as typeof schema.decisions.$inferSelect
  const [goalRow] = await db
    .select({ recordId: schema.goals.recordId, title: schema.goals.title })
    .from(schema.goals)
    .where(eq(schema.goals.id, decisionRow.goalId))

  const evidenceLinks = await db
    .select()
    .from(schema.decisionEvidence)
    .where(eq(schema.decisionEvidence.decisionId, decisionRow.id))
  const evidence: { id: string; title: string }[] = []
  for (const link of evidenceLinks) {
    if (link.insightId) {
      const [row] = await db
        .select({
          recordId: schema.insights.recordId,
          title: schema.insights.title,
        })
        .from(schema.insights)
        .where(eq(schema.insights.id, link.insightId))
      evidence.push({ id: row.recordId, title: row.title })
    } else if (link.factId) {
      const [row] = await db
        .select({ recordId: schema.facts.recordId, title: schema.facts.title })
        .from(schema.facts)
        .where(eq(schema.facts.id, link.factId))
      evidence.push({ id: row.recordId, title: row.title })
    }
  }

  let supersededBy: string | undefined
  if (decisionRow.supersededById) {
    const [row] = await db
      .select({ recordId: schema.decisions.recordId })
      .from(schema.decisions)
      .where(eq(schema.decisions.id, decisionRow.supersededById))
    supersededBy = row.recordId
  }

  const superseded = await db
    .select({ id: schema.decisions.recordId })
    .from(schema.decisions)
    .where(eq(schema.decisions.supersededById, decisionRow.id))

  return {
    id: decisionRow.recordId,
    folder,
    fields: {
      title: decisionRow.title,
      date: decisionRow.date,
      owner: decisionRow.owner,
      status: decisionRow.status,
      ...(decisionRow.issueUrl && { issue: decisionRow.issueUrl }),
    },
    body: decisionRow.body,
    goal: { id: goalRow.recordId, title: goalRow.title },
    evidence,
    supersededBy,
    supersedes: sortById(superseded).map((decision) => decision.id),
  }
}

function isMissing(value: ConceptFields[string]) {
  return (
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function validateFields(folder: ConceptFolder, fields: ConceptFields) {
  const required = CONCEPT_FIELDS[folder].required.filter(
    (field: string) => field !== 'id',
  )
  for (const field of required) {
    if (isMissing(fields[field]))
      throw new InvalidRecordError(`"${field}" is required`)
  }
  if (
    folder === 'decisions' &&
    fields.status === 'superseded' &&
    isMissing(fields.superseded_by)
  ) {
    throw new InvalidRecordError('a superseded Decision needs "superseded_by"')
  }
  if (
    folder === 'decisions' &&
    !isMissing(fields.supersedes) &&
    fields.status !== 'accepted'
  ) {
    throw new InvalidRecordError('"supersedes" needs the status "accepted"')
  }
}

const addedDecisionSchema = z.object({
  rows: z.array(z.object({ record_id: z.string() })),
})

async function addDecisionRows(
  db: ConceptDb,
  productId: number,
  fields: ConceptFields,
  body: string,
): Promise<string> {
  const goalRecordId = fields.goal as string
  const goalRows = await db
    .select({ id: schema.goals.id })
    .from(schema.goals)
    .where(
      and(
        eq(schema.goals.productId, productId),
        eq(schema.goals.recordId, goalRecordId),
      ),
    )
  if (goalRows.length === 0)
    throw new InvalidRecordError(`goal "${goalRecordId}" not found`)
  const [goalRow] = goalRows

  let supersededById: number | null = null
  if (fields.superseded_by) {
    const supersededByRecordId = fields.superseded_by as string
    const rows = await db
      .select({ id: schema.decisions.id })
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, productId),
          eq(schema.decisions.recordId, supersededByRecordId),
        ),
      )
    if (rows.length === 0)
      throw new InvalidRecordError(
        `decision "${supersededByRecordId}" not found`,
      )
    supersededById = rows[0].id
  }

  let supersededRowId: number | undefined
  if (fields.supersedes) {
    const supersededRecordId = fields.supersedes as string
    const rows = await db
      .select({ id: schema.decisions.id })
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, productId),
          eq(schema.decisions.recordId, supersededRecordId),
        ),
      )
    if (rows.length === 0)
      throw new InvalidRecordError(`decision "${supersededRecordId}" not found`)
    supersededRowId = rows[0].id
  }

  const evidenceRecordIds = Array.isArray(fields.evidence)
    ? [...new Set(fields.evidence)]
    : []
  const evidenceRows: { insightId?: number; factId?: number }[] = []
  for (const evidenceId of evidenceRecordIds) {
    const insightRows = await db
      .select({ id: schema.insights.id })
      .from(schema.insights)
      .where(
        and(
          eq(schema.insights.productId, productId),
          eq(schema.insights.recordId, evidenceId),
        ),
      )
    if (insightRows.length > 0) {
      evidenceRows.push({ insightId: insightRows[0].id })
      continue
    }
    const factRows = await db
      .select({ id: schema.facts.id })
      .from(schema.facts)
      .where(
        and(
          eq(schema.facts.productId, productId),
          eq(schema.facts.recordId, evidenceId),
        ),
      )
    if (factRows.length > 0) {
      evidenceRows.push({ factId: factRows[0].id })
      continue
    }
    throw new InvalidRecordError(`evidence "${evidenceId}" not found`)
  }

  if (evidenceRows.length === 0)
    throw new InvalidRecordError('"evidence" is required')

  // The id, the Decision, its evidence links and the change of the Decision
  // it supersedes go in as one statement, so a network failure never leaves
  // one without the others. The Neon HTTP driver has no transaction of
  // its own.
  //
  // The statement locks the Decision that it supersedes and adds nothing
  // when that Decision is superseded already. Thus the second of two
  // requests that supersede the same Decision changes nothing.
  const supersedes = supersededRowId !== undefined
  const oldDecision = supersedes
    ? sql`old_decision as (
        select id from "decisions"
        where id = ${supersededRowId} and status <> 'superseded'
        for update
      ),`
    : sql``
  const evidenceValues = sql.join(
    evidenceRows.map(
      ({ insightId = null, factId = null }) =>
        sql`(${insightId}::integer, ${factId}::integer)`,
    ),
    sql`, `,
  )
  const result = await db.execute(sql`
    with ${oldDecision}
    counter as (
      insert into "record_counters" ("product_id", "folder", "last_number")
      select
        ${productId}::integer,
        'decisions',
        ${numberAfterHighestId(productId, 'decisions')}
      ${supersedes ? sql`from old_decision` : sql``}
      on conflict ("product_id", "folder")
      do update set "last_number" = ${NEXT_COUNTER_NUMBER}
      returning "last_number"
    ),
    added_decision as (
      insert into "decisions" (
        "product_id", "record_id", "title", "date", "owner", "status",
        "goal_id", "superseded_by_id", "body"
      )
      select
        ${productId}::integer,
        ${CONCEPT_FIELDS.decisions.prefix}::text || "last_number",
        ${fields.title as string}::text,
        ${fields.date as string}::date,
        ${fields.owner as string}::text,
        ${fields.status as string}::text,
        ${goalRow.id}::integer,
        ${supersededById}::integer,
        ${body}::text
      from counter
      returning id, record_id
    ),
    added_evidence as (
      insert into "decision_evidence" ("decision_id", "insight_id", "fact_id")
      select added_decision.id, evidence.insight_id, evidence.fact_id
      from added_decision,
        (values ${evidenceValues}) as evidence (insight_id, fact_id)
    )
    ${
      supersedes
        ? sql`, superseded as (
            update "decisions"
            set status = 'superseded',
              superseded_by_id = (select id from added_decision)
            where id in (select id from old_decision)
          )`
        : sql``
    }
    select record_id from added_decision
  `)

  const { rows } = addedDecisionSchema.parse(result)
  if (rows.length === 0)
    throw new InvalidRecordError(`"${fields.supersedes}" is superseded already`)
  return rows[0].record_id
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

export async function addConceptRecord(
  db: ConceptDb,
  productSlug: string,
  folder: ConceptFolder,
  inputFields: ConceptFields,
  body: string,
): Promise<string> {
  const shouldDefaultDate =
    (folder === 'decisions' || folder === 'insights') &&
    isMissing(inputFields.date)
  const fields = shouldDefaultDate
    ? { ...inputFields, date: todayUtc() }
    : inputFields
  validateFields(folder, fields)

  // A Decision serves a Goal, so its Product exists already.
  const productId =
    folder === 'decisions'
      ? await findProductId(db, productSlug)
      : await addProductId(db, productSlug)
  if (folder === 'decisions')
    return addDecisionRows(db, productId, fields, body)

  const { counter, recordId } = nextRecordId(db, productId, folder)
  const addRecordRow = () => {
    switch (folder) {
      case 'goals':
        return db
          .with(counter)
          .insert(schema.goals)
          .values({
            productId,
            recordId,
            title: fields.title as string,
            metric: fields.metric as string,
            source: fields.source as string,
            measure:
              fields.measure === undefined
                ? null
                : goalMeasureSchema.parse(fields.measure),
            body,
          })
          .returning({ recordId: schema.goals.recordId })
      case 'insights':
        return db
          .with(counter)
          .insert(schema.insights)
          .values({
            productId,
            recordId,
            title: fields.title as string,
            date: fields.date as string,
            source: fields.source as string,
            status: (fields.status as schema.InsightStatus | undefined) ?? null,
            body,
          })
          .returning({ recordId: schema.insights.recordId })
      case 'facts':
        return db
          .with(counter)
          .insert(schema.facts)
          .values({
            productId,
            recordId,
            title: fields.title as string,
            source: fields.source as string,
            body,
          })
          .returning({ recordId: schema.facts.recordId })
      case 'guardrails':
        return db
          .with(counter)
          .insert(schema.guardrails)
          .values({
            productId,
            recordId,
            title: fields.title as string,
            enforcedBy: fields.enforced_by as string,
            body,
          })
          .returning({ recordId: schema.guardrails.recordId })
    }
  }
  const [added] = await addRecordRow()
  return added.recordId
}

// What a write of a Decision gives back: its id, and what became of its
// downstream issue.
export type DecisionChange = { id: string; issue: DownstreamIssue }

// Every write that can leave a Decision accepted ends here, so the CLI, the
// HTTP API and the app all open the downstream issue.
async function openDownstream(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  id: string,
): Promise<DecisionChange> {
  return {
    id,
    issue: await createDownstreamIssue(db, github, productSlug, id),
  }
}

export async function addDecision(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  fields: ConceptFields,
  body: string,
): Promise<DecisionChange> {
  const id = await addConceptRecord(db, productSlug, 'decisions', fields, body)
  return openDownstream(db, github, productSlug, id)
}

export async function updateDecision(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  id: string,
  status: schema.DecisionStatus,
  supersededByRecordId?: string,
): Promise<DecisionChange> {
  await setDecisionStatus(db, productSlug, id, status, supersededByRecordId)
  return openDownstream(db, github, productSlug, id)
}

// null removes it: the Product's Goals are not measured.
export async function setAnalyticsProject(
  db: ConceptDb,
  productSlug: string,
  analyticsProject: string | null,
): Promise<void> {
  const updated = await db
    .update(schema.products)
    .set({ analyticsProject })
    .where(eq(schema.products.slug, productSlug))
    .returning({ id: schema.products.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// null removes it: Glue stops reading the Product's comments. A new handle is
// read from its first comment.
export async function setSocialHandle(
  db: ConceptDb,
  productSlug: string,
  socialHandle: string | null,
): Promise<void> {
  const updated = await db
    .update(schema.products)
    .set({ socialHandle, commentsReadUntil: null })
    .where(eq(schema.products.slug, productSlug))
    .returning({ id: schema.products.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

export const goalChangeSchema = z.object({
  measure: goalMeasureSchema.nullable().optional().meta({
    description:
      'null stops measuring the Goal. A new measure clears the baseline and the latest value',
  }),
  status: z.enum(schema.goalStatuses).optional(),
})

export type GoalChange = z.infer<typeof goalChangeSchema>

// Sets the fields the change names. A null measure: Glue stops measuring
// the Goal. A new measure reads another metric, so it clears the baseline
// and the latest value.
export async function updateGoal(
  db: ConceptDb,
  productSlug: string,
  id: string,
  change: GoalChange,
): Promise<void> {
  const { measure, status } = goalChangeSchema.parse(change)
  if (measure === undefined && status === undefined) {
    throw new InvalidRecordError('send a measure, a status or both')
  }
  const productId = await findProductId(db, productSlug)
  const updated = await db
    .update(schema.goals)
    .set({
      status,
      ...(measure !== undefined && {
        measure,
        baseline: null,
        latestValue: null,
        measuredAt: null,
      }),
    })
    .where(
      and(eq(schema.goals.productId, productId), eq(schema.goals.recordId, id)),
    )
    .returning({ id: schema.goals.id })
  if (updated.length === 0)
    throw new InvalidRecordError(`goal "${id}" not found`)
}

export async function setDecisionStatus(
  db: ConceptDb,
  productSlug: string,
  id: string,
  status: schema.DecisionStatus,
  supersededByRecordId?: string,
): Promise<void> {
  if (!schema.decisionStatuses.includes(status)) {
    throw new InvalidRecordError(
      `status "${status}" must be one of ${schema.decisionStatuses.join(', ')}`,
    )
  }
  if (status === 'superseded' && !supersededByRecordId) {
    throw new InvalidRecordError('a superseded Decision needs "superseded_by"')
  }
  if (status !== 'superseded' && supersededByRecordId) {
    throw new InvalidRecordError(
      '"superseded_by" only applies to a superseded Decision',
    )
  }
  if (supersededByRecordId === id) {
    throw new InvalidRecordError('a Decision cannot supersede itself')
  }

  const productId = await findProductId(db, productSlug)
  const decisionRows = await db
    .select({ id: schema.decisions.id })
    .from(schema.decisions)
    .where(
      and(
        eq(schema.decisions.productId, productId),
        eq(schema.decisions.recordId, id),
      ),
    )
  if (decisionRows.length === 0)
    throw new InvalidRecordError(`decision "${id}" not found`)
  const [decisionRow] = decisionRows

  let supersededById: number | null = null
  if (supersededByRecordId) {
    const rows = await db
      .select({ id: schema.decisions.id })
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, productId),
          eq(schema.decisions.recordId, supersededByRecordId),
        ),
      )
    if (rows.length === 0)
      throw new InvalidRecordError(
        `decision "${supersededByRecordId}" not found`,
      )
    supersededById = rows[0].id
  }

  // A superseded Decision keeps the Decision that superseded it first.
  const updated = await db
    .update(schema.decisions)
    .set({ status, supersededById })
    .where(
      and(
        eq(schema.decisions.id, decisionRow.id),
        status === 'superseded'
          ? ne(schema.decisions.status, 'superseded')
          : undefined,
      ),
    )
    .returning({ id: schema.decisions.id })
  if (updated.length === 0)
    throw new InvalidRecordError(`"${id}" is superseded already`)
}

// Accepts a Decision that waits for it. Any other change of status goes
// through updateDecision. The update itself asks for the status
// "proposed", so only one of two requests at the same time accepts.
export async function acceptDecision(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  id: string,
): Promise<DecisionChange> {
  const productId = await findProductId(db, productSlug)
  const isDecision = and(
    eq(schema.decisions.productId, productId),
    eq(schema.decisions.recordId, id),
  )
  const accepted = await db
    .update(schema.decisions)
    .set({ status: 'accepted' })
    .where(and(isDecision, eq(schema.decisions.status, 'proposed')))
    .returning({ id: schema.decisions.id })
  if (accepted.length === 0) {
    const rows = await db
      .select({ id: schema.decisions.id })
      .from(schema.decisions)
      .where(isDecision)
    throw new InvalidRecordError(
      rows.length === 0
        ? `decision "${id}" not found`
        : `"${id}" is not proposed`,
    )
  }

  return openDownstream(db, github, productSlug, id)
}

// The condition that matches one Insight only while it is a draft.
async function findDraft(db: ConceptDb, productSlug: string, id: string) {
  const productId = await findProductId(db, productSlug)
  const rows = await db
    .select({ id: schema.insights.id, status: schema.insights.status })
    .from(schema.insights)
    .where(
      and(
        eq(schema.insights.productId, productId),
        eq(schema.insights.recordId, id),
      ),
    )
  if (rows.length === 0)
    throw new InvalidRecordError(`insight "${id}" not found`)
  if (rows[0].status !== 'draft')
    throw new InvalidRecordError(`"${id}" is not a draft`)

  return {
    rowId: rows[0].id,
    matches: and(
      eq(schema.insights.id, rows[0].id),
      eq(schema.insights.status, 'draft'),
    ),
  }
}

// Triage of a draft Insight: it becomes a normal Insight.
export async function keepInsight(
  db: ConceptDb,
  productSlug: string,
  id: string,
): Promise<void> {
  const draft = await findDraft(db, productSlug, id)
  await db.update(schema.insights).set({ status: null }).where(draft.matches)
}

// Triage of a draft Insight: it goes away. Only a draft can be discarded,
// and only while no Decision cites it.
export async function discardInsight(
  db: ConceptDb,
  productSlug: string,
  id: string,
): Promise<void> {
  const draft = await findDraft(db, productSlug, id)
  const citations = await db
    .select({ id: schema.decisions.recordId })
    .from(schema.decisionEvidence)
    .innerJoin(
      schema.decisions,
      eq(schema.decisionEvidence.decisionId, schema.decisions.id),
    )
    .where(eq(schema.decisionEvidence.insightId, draft.rowId))
  if (citations.length > 0) {
    const cited = sortById(citations).map((decision) => decision.id)
    throw new InvalidRecordError(
      `"${id}" is the evidence of ${cited.join(', ')}`,
    )
  }

  await db.delete(schema.insights).where(draft.matches)
}
