import { and, eq } from 'drizzle-orm'

import { CONCEPT_FIELDS } from './concept-fields.ts'
import type { ConceptDb } from './import-concept.ts'
import * as schema from './schema.ts'

export type ConceptFolder = keyof typeof CONCEPT_FIELDS
export type ConceptFields = Record<string, string | string[] | undefined>

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
  if (products.length === 0)
    throw new Error(`product "${productSlug}" not found`)
  return products[0].id
}

async function addProductId(db: ConceptDb, productSlug: string) {
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

async function nextRecordId(
  db: ConceptDb,
  productId: number,
  folder: ConceptFolder,
) {
  const table = FOLDER_TABLES[folder]
  const rows = await db
    .select({ recordId: table.recordId })
    .from(table)
    .where(eq(table.productId, productId))
  const prefix = CONCEPT_FIELDS[folder].prefix
  const highest = rows.reduce((max, row) => {
    const number = Number(row.recordId.slice(prefix.length))
    return Number.isFinite(number) && number > max ? number : max
  }, 0)
  return `${prefix}${highest + 1}`
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
    for (const record of records as Record<string, unknown>[]) {
      rows.push({
        id: record.recordId as string,
        status: 'status' in record ? String(record.status ?? '') : '',
        title: record.title as string,
      })
    }
  }
  return rows
}

export type ConceptShowResult = {
  id: string
  folder: ConceptFolder
  fields: Record<string, string>
  body: string
  goal?: { id: string; title: string }
  evidence?: { id: string; title: string }[]
  supersededBy?: string
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
      fields: fields as Record<string, string>,
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

  return {
    id: decisionRow.recordId,
    folder,
    fields: {
      title: decisionRow.title,
      date: decisionRow.date,
      owner: decisionRow.owner,
      status: decisionRow.status,
    },
    body: decisionRow.body,
    goal: { id: goalRow.recordId, title: goalRow.title },
    evidence,
    supersededBy,
  }
}

function isMissing(value: string | string[] | undefined) {
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
    if (isMissing(fields[field])) throw new Error(`"${field}" is required`)
  }
  if (
    folder === 'decisions' &&
    fields.status === 'superseded' &&
    isMissing(fields.superseded_by)
  ) {
    throw new Error('a superseded Decision needs "superseded_by"')
  }
}

async function addDecision(
  db: ConceptDb,
  productId: number,
  recordId: string,
  fields: ConceptFields,
  body: string,
) {
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
  if (goalRows.length === 0) throw new Error(`goal "${goalRecordId}" not found`)
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
      throw new Error(`decision "${supersededByRecordId}" not found`)
    supersededById = rows[0].id
  }

  const evidenceRecordIds = Array.isArray(fields.evidence)
    ? fields.evidence
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
    throw new Error(`evidence "${evidenceId}" not found`)
  }

  const [decisionRow] = await db
    .insert(schema.decisions)
    .values({
      productId,
      recordId,
      title: fields.title as string,
      date: fields.date as string,
      owner: fields.owner as string,
      status: fields.status as schema.DecisionStatus,
      goalId: goalRow.id,
      supersededById,
      body,
    })
    .returning({ id: schema.decisions.id })

  for (const evidenceRow of evidenceRows) {
    await db.insert(schema.decisionEvidence).values({
      decisionId: decisionRow.id,
      insightId: evidenceRow.insightId ?? null,
      factId: evidenceRow.factId ?? null,
    })
  }
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
  const needsDateDefault =
    (folder === 'decisions' || folder === 'insights') &&
    isMissing(inputFields.date)
  const fields = needsDateDefault
    ? { ...inputFields, date: todayUtc() }
    : inputFields
  validateFields(folder, fields)

  const productId = await addProductId(db, productSlug)
  const recordId = await nextRecordId(db, productId, folder)

  switch (folder) {
    case 'goals':
      await db.insert(schema.goals).values({
        productId,
        recordId,
        title: fields.title as string,
        metric: fields.metric as string,
        source: fields.source as string,
        body,
      })
      break
    case 'insights':
      await db.insert(schema.insights).values({
        productId,
        recordId,
        title: fields.title as string,
        date: fields.date as string,
        source: fields.source as string,
        status: (fields.status as schema.InsightStatus | undefined) ?? null,
        body,
      })
      break
    case 'facts':
      await db.insert(schema.facts).values({
        productId,
        recordId,
        title: fields.title as string,
        source: fields.source as string,
        body,
      })
      break
    case 'guardrails':
      await db.insert(schema.guardrails).values({
        productId,
        recordId,
        title: fields.title as string,
        enforcedBy: fields.enforced_by as string,
        body,
      })
      break
    case 'decisions':
      await addDecision(db, productId, recordId, fields, body)
      break
  }

  return recordId
}

export async function setDecisionStatus(
  db: ConceptDb,
  productSlug: string,
  id: string,
  status: schema.DecisionStatus,
  supersededByRecordId?: string,
): Promise<void> {
  if (!schema.decisionStatuses.includes(status)) {
    throw new Error(
      `status "${status}" must be one of ${schema.decisionStatuses.join(', ')}`,
    )
  }
  if (status === 'superseded' && !supersededByRecordId) {
    throw new Error('a superseded Decision needs "superseded_by"')
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
  if (decisionRows.length === 0) throw new Error(`decision "${id}" not found`)
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
      throw new Error(`decision "${supersededByRecordId}" not found`)
    supersededById = rows[0].id
  }

  await db
    .update(schema.decisions)
    .set({ status, supersededById })
    .where(eq(schema.decisions.id, decisionRow.id))
}
