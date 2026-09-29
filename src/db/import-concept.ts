import type { PgDatabase } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'

import type { ConceptRecord as FullConceptRecord } from '../../scripts/check-concept.mjs'
import * as schema from './schema.ts'

export type ConceptRecord = Pick<FullConceptRecord, 'folder' | 'data' | 'body'>

export type ConceptDb = PgDatabase<any, typeof schema>

export async function importConcept(
  db: ConceptDb,
  records: ConceptRecord[],
  productSlug: string,
) {
  const [product] = await db
    .insert(schema.products)
    .values({ slug: productSlug, name: productSlug })
    .onConflictDoUpdate({
      target: schema.products.slug,
      set: { slug: productSlug },
    })
    .returning({ id: schema.products.id })
  const productId = product.id

  const goalIds = await upsertGoals(db, productId, records)
  const insightIds = await upsertInsights(db, productId, records)
  const factIds = await upsertFacts(db, productId, records)
  await upsertGuardrails(db, productId, records)

  const decisionRecords = records.filter(
    (record): record is ConceptRecord & { data: Record<string, unknown> } =>
      record.folder === 'decisions' && record.data != null,
  )

  const decisionIds = new Map<string, number>()
  for (const { data, body } of decisionRecords) {
    const recordId = String(data.id)
    const goalId = goalIds.get(String(data.goal))
    if (goalId === undefined) {
      throw new Error(`decision ${recordId}: goal "${data.goal}" not found`)
    }
    const [row] = await db
      .insert(schema.decisions)
      .values({
        productId,
        recordId,
        title: String(data.title),
        date: String(data.date),
        owner: String(data.owner),
        status: data.status as schema.DecisionStatus,
        goalId,
        body,
      })
      .onConflictDoUpdate({
        target: [schema.decisions.productId, schema.decisions.recordId],
        set: {
          title: String(data.title),
          date: String(data.date),
          owner: String(data.owner),
          status: data.status as schema.DecisionStatus,
          goalId,
          body,
        },
      })
      .returning({ id: schema.decisions.id })
    decisionIds.set(recordId, row.id)
  }

  for (const { data } of decisionRecords) {
    const recordId = String(data.id)
    const decisionId = decisionIds.get(recordId)
    if (decisionId === undefined) continue
    const supersededBy = data.superseded_by
      ? decisionIds.get(String(data.superseded_by))
      : null
    await db
      .update(schema.decisions)
      .set({ supersededById: supersededBy ?? null })
      .where(eq(schema.decisions.id, decisionId))

    await db
      .delete(schema.decisionEvidence)
      .where(eq(schema.decisionEvidence.decisionId, decisionId))

    const evidence = Array.isArray(data.evidence) ? data.evidence : []
    for (const evidenceId of evidence as string[]) {
      const insightId = insightIds.get(evidenceId)
      const factId = factIds.get(evidenceId)
      if (insightId === undefined && factId === undefined) {
        throw new Error(
          `decision ${recordId}: evidence "${evidenceId}" not found`,
        )
      }
      await db.insert(schema.decisionEvidence).values({
        decisionId,
        insightId: insightId ?? null,
        factId: factId ?? null,
      })
    }
  }
}

async function upsertGoals(
  db: ConceptDb,
  productId: number,
  records: ConceptRecord[],
) {
  const ids = new Map<string, number>()
  for (const record of records) {
    if (record.folder !== 'goals' || record.data == null) continue
    const { data, body } = record
    const recordId = String(data.id)
    const fields = {
      title: String(data.title),
      metric: String(data.metric),
      source: String(data.source),
      body,
    }
    const [row] = await db
      .insert(schema.goals)
      .values({ productId, recordId, ...fields })
      .onConflictDoUpdate({
        target: [schema.goals.productId, schema.goals.recordId],
        set: fields,
      })
      .returning({ id: schema.goals.id })
    ids.set(recordId, row.id)
  }
  return ids
}

async function upsertInsights(
  db: ConceptDb,
  productId: number,
  records: ConceptRecord[],
) {
  const ids = new Map<string, number>()
  for (const record of records) {
    if (record.folder !== 'insights' || record.data == null) continue
    const { data, body } = record
    const recordId = String(data.id)
    const fields = {
      title: String(data.title),
      date: String(data.date),
      source: String(data.source),
      status: (data.status as schema.InsightStatus | undefined) ?? null,
      body,
    }
    const [row] = await db
      .insert(schema.insights)
      .values({ productId, recordId, ...fields })
      .onConflictDoUpdate({
        target: [schema.insights.productId, schema.insights.recordId],
        set: fields,
      })
      .returning({ id: schema.insights.id })
    ids.set(recordId, row.id)
  }
  return ids
}

async function upsertFacts(
  db: ConceptDb,
  productId: number,
  records: ConceptRecord[],
) {
  const ids = new Map<string, number>()
  for (const record of records) {
    if (record.folder !== 'facts' || record.data == null) continue
    const { data, body } = record
    const recordId = String(data.id)
    const fields = {
      title: String(data.title),
      source: String(data.source),
      body,
    }
    const [row] = await db
      .insert(schema.facts)
      .values({ productId, recordId, ...fields })
      .onConflictDoUpdate({
        target: [schema.facts.productId, schema.facts.recordId],
        set: fields,
      })
      .returning({ id: schema.facts.id })
    ids.set(recordId, row.id)
  }
  return ids
}

async function upsertGuardrails(
  db: ConceptDb,
  productId: number,
  records: ConceptRecord[],
) {
  for (const record of records) {
    if (record.folder !== 'guardrails' || record.data == null) continue
    const { data, body } = record
    const recordId = String(data.id)
    const fields = {
      title: String(data.title),
      enforcedBy: String(data.enforced_by),
      body,
    }
    await db
      .insert(schema.guardrails)
      .values({ productId, recordId, ...fields })
      .onConflictDoUpdate({
        target: [schema.guardrails.productId, schema.guardrails.recordId],
        set: fields,
      })
  }
}
