import type { PgDatabase } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'

import type { ConceptRecord as FullConceptRecord } from '../../scripts/check-concept.mjs'
import * as schema from './schema.ts'

export type ConceptRecord = Pick<FullConceptRecord, 'folder' | 'data'>

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

  const goalIds = await upsertSimple(db, schema.goals, productId, records, 'goals', (data) => ({
    title: String(data.title),
    metric: String(data.metric),
    source: String(data.source),
  }))
  const insightIds = await upsertSimple(
    db,
    schema.insights,
    productId,
    records,
    'insights',
    (data) => ({
      title: String(data.title),
      date: String(data.date),
      source: String(data.source),
    }),
  )
  const factIds = await upsertSimple(db, schema.facts, productId, records, 'facts', (data) => ({
    title: String(data.title),
    source: String(data.source),
  }))
  await upsertSimple(db, schema.guardrails, productId, records, 'guardrails', (data) => ({
    title: String(data.title),
    enforcedBy: String(data.enforced_by),
  }))

  const decisionRecords = records.filter(
    (record): record is ConceptRecord & { data: Record<string, unknown> } =>
      record.folder === 'decisions' && record.data != null,
  )

  const decisionIds = new Map<string, number>()
  for (const { data } of decisionRecords) {
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
      })
      .onConflictDoUpdate({
        target: [schema.decisions.productId, schema.decisions.recordId],
        set: {
          title: String(data.title),
          date: String(data.date),
          owner: String(data.owner),
          status: data.status as schema.DecisionStatus,
          goalId,
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
      await db.insert(schema.decisionEvidence).values({
        decisionId,
        insightId: insightId ?? null,
        factId: factId ?? null,
      })
    }
  }
}

async function upsertSimple<
  TTable extends
    | typeof schema.goals
    | typeof schema.insights
    | typeof schema.facts
    | typeof schema.guardrails,
>(
  db: ConceptDb,
  table: TTable,
  productId: number,
  records: ConceptRecord[],
  folder: ConceptRecord['folder'],
  toFields: (data: Record<string, unknown>) => Record<string, unknown>,
) {
  const ids = new Map<string, number>()
  for (const record of records) {
    if (record.folder !== folder || record.data == null) continue
    const recordId = String(record.data.id)
    // Drizzle can't narrow an insert/update shape from a union of table
    // types; the columns are the same shape at runtime for every caller.
    const [row] = await db
      .insert(table)
      .values({ productId, recordId, ...toFields(record.data) } as never)
      .onConflictDoUpdate({
        target: [table.productId, table.recordId],
        set: toFields(record.data) as never,
      })
      .returning({ id: table.id })
    ids.set(recordId, row.id)
  }
  return ids
}
