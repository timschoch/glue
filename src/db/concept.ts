import type { SQL } from 'drizzle-orm'
import { and, eq, isNotNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import type { ConceptDb } from './client.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import { isRecordId } from './record-id.ts'
import * as schema from './schema.ts'

// The shapes of the Concept as Glue shows it. The HTTP API documents its
// responses with these schemas, so the types come from them.
export const recordReferenceSchema = z
  .object({ id: z.string(), title: z.string() })
  .meta({ id: 'RecordReference' })

export type RecordReference = z.infer<typeof recordReferenceSchema>

export const goalSchema = z
  .object({
    kind: z.literal('goal'),
    ...recordReferenceSchema.shape,
    metric: z.string(),
    source: z.string(),
    measure: goalMeasureSchema.nullable(),
    status: z.enum(schema.goalStatuses).meta({
      description: 'A person or an agent sets it. Glue never closes a Goal',
    }),
    baseline: z.number().nullable().meta({
      description:
        'A mean measure: the mean of the first measure run, or of the baseline value',
    }),
    latestValue: z.number().nullable().meta({
      description:
        'A mean measure: the mean of the last measure run, or of its latest breakdown value',
    }),
    latestBreakdownValue: z.string().nullable().meta({
      description:
        'A mean measure with a baseline value: the breakdown value the last measure run saw last',
    }),
    measuredAt: z.iso.datetime().nullable().meta({
      description: 'The time of the last measure run that read a value',
    }),
    body: z.string(),
    decisions: z.array(recordReferenceSchema),
  })
  .meta({ id: 'Goal' })

export type Goal = z.infer<typeof goalSchema>

export const decisionSchema = z
  .object({
    kind: z.literal('decision'),
    ...recordReferenceSchema.shape,
    date: z.iso.date(),
    owner: z.string(),
    status: z.enum(schema.decisionStatuses),
    body: z.string(),
    goal: recordReferenceSchema,
    evidence: z.array(recordReferenceSchema),
    supersededBy: recordReferenceSchema.nullable(),
    supersedes: z.array(recordReferenceSchema),
    issueUrl: z.url().nullable().meta({
      description:
        'The issue that builds the accepted Decision in the repository of its Product',
    }),
  })
  .meta({ id: 'Decision' })

export type Decision = z.infer<typeof decisionSchema>

export const insightSchema = z
  .object({
    kind: z.literal('insight'),
    ...recordReferenceSchema.shape,
    date: z.iso.date(),
    source: z.string(),
    status: z.enum(schema.insightStatuses).nullable(),
    body: z.string(),
    decisions: z.array(recordReferenceSchema),
  })
  .meta({ id: 'Insight' })

export type Insight = z.infer<typeof insightSchema>

export const factSchema = z
  .object({
    kind: z.literal('fact'),
    ...recordReferenceSchema.shape,
    source: z.string(),
    body: z.string(),
    decisions: z.array(recordReferenceSchema),
  })
  .meta({ id: 'Fact' })

export type Fact = z.infer<typeof factSchema>

export const guardrailSchema = z
  .object({
    kind: z.literal('guardrail'),
    ...recordReferenceSchema.shape,
    enforcedBy: z.string(),
    body: z.string(),
  })
  .meta({ id: 'Guardrail' })

export type Guardrail = z.infer<typeof guardrailSchema>

// A record with its links in both directions.
export type LinkedRecord = Goal | Decision | Insight | Fact | Guardrail

// A Decision as the overview shows it, without its body.
export const decisionSummarySchema = decisionSchema
  .pick({
    id: true,
    title: true,
    date: true,
    owner: true,
    status: true,
    goal: true,
    evidence: true,
  })
  .meta({ id: 'DecisionSummary' })

export type DecisionSummary = z.infer<typeof decisionSummarySchema>

// The overview of each folder, as the Concept lists it.
export const conceptSummarySchemas = {
  goals: goalSchema
    .pick({
      id: true,
      title: true,
      metric: true,
      status: true,
      latestValue: true,
    })
    .meta({ id: 'GoalSummary' }),
  decisions: decisionSummarySchema,
  guardrails: guardrailSchema
    .pick({ id: true, title: true, enforcedBy: true })
    .meta({ id: 'GuardrailSummary' }),
  insights: insightSchema
    .pick({ id: true, title: true, date: true, status: true })
    .meta({ id: 'InsightSummary' }),
  facts: recordReferenceSchema,
}

export const conceptSchema = z
  .object({
    product: z.object({ slug: z.string(), name: z.string() }),
    goals: z.array(conceptSummarySchemas.goals),
    decisions: z.array(conceptSummarySchemas.decisions),
    guardrails: z.array(conceptSummarySchemas.guardrails),
    insights: z.array(conceptSummarySchemas.insights),
    facts: z.array(conceptSummarySchemas.facts),
  })
  .meta({ id: 'Concept' })

export type Concept = z.infer<typeof conceptSchema>

const { products, goals, decisions, insights, facts, guardrails } = schema
const { decisionEvidence } = schema

// Ids sort by their number: D2 comes before D10.
export function sortById<TItem extends { id: string }>(
  items: TItem[],
): TItem[] {
  return items.sort(
    (left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
  )
}

export async function findProduct(db: ConceptDb, productSlug: string) {
  const found = await db
    .select()
    .from(products)
    .where(eq(products.slug, productSlug))
  return found.at(0)
}

export type Product = Concept['product']

export function listProducts(db: ConceptDb): Promise<Product[]> {
  return db
    .select({ slug: products.slug, name: products.name })
    .from(products)
    .orderBy(products.slug)
}

// A Product whose public comments Glue reads, with its read position.
export type SocialProduct = {
  id: number
  slug: string
  handle: string
  readUntil: Date | null
}

// The Products with a social handle: all of them, or the one of the slug.
export async function listSocialProducts(
  db: ConceptDb,
  productSlug?: string,
): Promise<SocialProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      handle: products.socialHandle,
      readUntil: products.commentsReadUntil,
    })
    .from(products)
    .where(
      and(
        isNotNull(products.socialHandle),
        productSlug === undefined ? undefined : eq(products.slug, productSlug),
      ),
    )
    .orderBy(products.id)
  return rows.flatMap(({ handle, ...row }) =>
    handle ? [{ ...row, handle }] : [],
  )
}

// The open Goals with a measure, each with the Product that holds it: of all
// Products, or of the one of the slug. The measure is as stored, not parsed.
export function listGoalsWithMeasure(db: ConceptDb, productSlug?: string) {
  return db
    .select({
      productId: products.id,
      productSlug: products.slug,
      analyticsProject: products.analyticsProject,
      goalId: goals.id,
      goalRecordId: goals.recordId,
      baseline: goals.baseline,
      measure: goals.measure,
    })
    .from(goals)
    .innerJoin(products, eq(goals.productId, products.id))
    .where(
      and(
        isNotNull(goals.measure),
        eq(goals.status, 'open'),
        productSlug === undefined ? undefined : eq(products.slug, productSlug),
      ),
    )
    .orderBy(goals.id)
}

// The accepted Decisions that serve the Goal, by the Goal's row id.
export async function listAcceptedDecisions(
  db: ConceptDb,
  goalId: number,
): Promise<RecordReference[]> {
  const accepted = await db
    .select({ id: decisions.recordId, title: decisions.title })
    .from(decisions)
    .where(and(eq(decisions.goalId, goalId), eq(decisions.status, 'accepted')))
  return sortById(accepted)
}

// The status of each Decision of the Product, with the id of the Decision
// that superseded it.
export function listDecisionStatuses(db: ConceptDb, productSlug: string) {
  const supersededBy = alias(decisions, 'superseded_by')
  return db
    .select({
      id: decisions.recordId,
      status: decisions.status,
      supersededById: supersededBy.recordId,
    })
    .from(decisions)
    .innerJoin(products, eq(decisions.productId, products.id))
    .leftJoin(supersededBy, eq(supersededBy.id, decisions.supersededById))
    .where(eq(products.slug, productSlug))
}

// The id of the Product's Insight with this source, or null.
export async function findInsightIdBySource(
  db: ConceptDb,
  productId: number,
  source: string,
) {
  const found = await db
    .select({ id: insights.recordId })
    .from(insights)
    .where(and(eq(insights.productId, productId), eq(insights.source, source)))
  return found.at(0)?.id ?? null
}

// The source and the date of each Insight of the Product. An unknown Product
// has none.
export async function listInsightSources(db: ConceptDb, productSlug: string) {
  const product = await findProduct(db, productSlug)
  if (!product) return []
  return db
    .select({
      id: insights.recordId,
      source: insights.source,
      date: insights.date,
    })
    .from(insights)
    .where(eq(insights.productId, product.id))
}

// The evidence of each Decision that matches, by the Decision's row id.
async function listEvidence(db: ConceptDb, matches: SQL) {
  const rows = await db
    .select({
      decisionId: decisionEvidence.decisionId,
      insightId: insights.recordId,
      insightTitle: insights.title,
      factId: facts.recordId,
      factTitle: facts.title,
    })
    .from(decisionEvidence)
    .innerJoin(decisions, eq(decisionEvidence.decisionId, decisions.id))
    .leftJoin(insights, eq(decisionEvidence.insightId, insights.id))
    .leftJoin(facts, eq(decisionEvidence.factId, facts.id))
    .where(matches)
    .orderBy(decisionEvidence.id)

  const evidence = new Map<number, RecordReference[]>()
  for (const row of rows) {
    const reference =
      row.insightId !== null && row.insightTitle !== null
        ? { id: row.insightId, title: row.insightTitle }
        : { id: String(row.factId), title: String(row.factTitle) }
    evidence.set(row.decisionId, [
      ...(evidence.get(row.decisionId) ?? []),
      reference,
    ])
  }
  return evidence
}

export async function findConcept(
  db: ConceptDb,
  productSlug: string,
): Promise<Concept | undefined> {
  const product = await findProduct(db, productSlug)
  if (!product) return undefined

  const [
    goalRows,
    decisionRows,
    evidence,
    guardrailRows,
    insightRows,
    factRows,
  ] = await Promise.all([
    db
      .select({
        id: goals.recordId,
        title: goals.title,
        metric: goals.metric,
        status: goals.status,
        latestValue: goals.latestValue,
      })
      .from(goals)
      .where(eq(goals.productId, product.id)),
    db
      .select({
        rowId: decisions.id,
        id: decisions.recordId,
        title: decisions.title,
        date: decisions.date,
        owner: decisions.owner,
        status: decisions.status,
        goalId: goals.recordId,
        goalTitle: goals.title,
      })
      .from(decisions)
      .innerJoin(goals, eq(decisions.goalId, goals.id))
      .where(eq(decisions.productId, product.id)),
    listEvidence(db, eq(decisions.productId, product.id)),
    db
      .select({
        id: guardrails.recordId,
        title: guardrails.title,
        enforcedBy: guardrails.enforcedBy,
      })
      .from(guardrails)
      .where(eq(guardrails.productId, product.id)),
    db
      .select({
        id: insights.recordId,
        title: insights.title,
        date: insights.date,
        status: insights.status,
      })
      .from(insights)
      .where(eq(insights.productId, product.id)),
    db
      .select({ id: facts.recordId, title: facts.title })
      .from(facts)
      .where(eq(facts.productId, product.id)),
  ])

  return {
    product: { slug: product.slug, name: product.name },
    goals: sortById(goalRows),
    decisions: sortById(
      decisionRows.map(({ rowId, goalId, goalTitle, ...decision }) => ({
        ...decision,
        goal: { id: goalId, title: goalTitle },
        evidence: evidence.get(rowId) ?? [],
      })),
    ),
    guardrails: sortById(guardrailRows),
    insights: sortById(insightRows),
    facts: sortById(factRows),
  }
}

const reference = { id: decisions.recordId, title: decisions.title }

async function findGoal(
  db: ConceptDb,
  productId: number,
  recordId: string,
): Promise<Goal | undefined> {
  const found = await db
    .select()
    .from(goals)
    .where(and(eq(goals.productId, productId), eq(goals.recordId, recordId)))
  const goal = found.at(0)
  if (!goal) return undefined

  const served = await db
    .select(reference)
    .from(decisions)
    .where(eq(decisions.goalId, goal.id))

  return {
    kind: 'goal',
    id: goal.recordId,
    title: goal.title,
    metric: goal.metric,
    source: goal.source,
    measure: goal.measure,
    status: goal.status,
    baseline: goal.baseline,
    latestValue: goal.latestValue,
    latestBreakdownValue: goal.latestBreakdownValue,
    measuredAt: goal.measuredAt?.toISOString() ?? null,
    body: goal.body,
    decisions: sortById(served),
  }
}

async function findDecision(
  db: ConceptDb,
  productId: number,
  recordId: string,
): Promise<Decision | undefined> {
  const superseding = alias(decisions, 'superseding')
  const found = await db
    .select({
      rowId: decisions.id,
      id: decisions.recordId,
      title: decisions.title,
      date: decisions.date,
      owner: decisions.owner,
      status: decisions.status,
      body: decisions.body,
      issueUrl: decisions.issueUrl,
      goalId: goals.recordId,
      goalTitle: goals.title,
      supersededById: superseding.recordId,
      supersededByTitle: superseding.title,
    })
    .from(decisions)
    .innerJoin(goals, eq(decisions.goalId, goals.id))
    .leftJoin(superseding, eq(decisions.supersededById, superseding.id))
    .where(
      and(eq(decisions.productId, productId), eq(decisions.recordId, recordId)),
    )
  const decision = found.at(0)
  if (!decision) return undefined

  const [evidence, supersedes] = await Promise.all([
    listEvidence(db, eq(decisions.id, decision.rowId)),
    db
      .select(reference)
      .from(decisions)
      .where(eq(decisions.supersededById, decision.rowId)),
  ])
  const { rowId, goalId, goalTitle, supersededById, supersededByTitle } =
    decision

  return {
    kind: 'decision',
    id: decision.id,
    title: decision.title,
    date: decision.date,
    owner: decision.owner,
    status: decision.status,
    body: decision.body,
    goal: { id: goalId, title: goalTitle },
    evidence: evidence.get(rowId) ?? [],
    supersededBy:
      supersededById !== null && supersededByTitle !== null
        ? { id: supersededById, title: supersededByTitle }
        : null,
    supersedes: sortById(supersedes),
    issueUrl: decision.issueUrl,
  }
}

// The Decisions that cite the evidence that matches.
async function listCitations(db: ConceptDb, matches: SQL) {
  const citations = await db
    .select(reference)
    .from(decisionEvidence)
    .innerJoin(decisions, eq(decisionEvidence.decisionId, decisions.id))
    .where(matches)
  return sortById(citations)
}

async function findInsight(
  db: ConceptDb,
  productId: number,
  recordId: string,
): Promise<Insight | undefined> {
  const found = await db
    .select()
    .from(insights)
    .where(
      and(eq(insights.productId, productId), eq(insights.recordId, recordId)),
    )
  const insight = found.at(0)
  if (!insight) return undefined

  return {
    kind: 'insight',
    id: insight.recordId,
    title: insight.title,
    date: insight.date,
    source: insight.source,
    status: insight.status,
    body: insight.body,
    decisions: await listCitations(
      db,
      eq(decisionEvidence.insightId, insight.id),
    ),
  }
}

async function findFact(
  db: ConceptDb,
  productId: number,
  recordId: string,
): Promise<Fact | undefined> {
  const found = await db
    .select()
    .from(facts)
    .where(and(eq(facts.productId, productId), eq(facts.recordId, recordId)))
  const fact = found.at(0)
  if (!fact) return undefined

  return {
    kind: 'fact',
    id: fact.recordId,
    title: fact.title,
    source: fact.source,
    body: fact.body,
    decisions: await listCitations(db, eq(decisionEvidence.factId, fact.id)),
  }
}

async function findGuardrail(
  db: ConceptDb,
  productId: number,
  recordId: string,
): Promise<Guardrail | undefined> {
  const found = await db
    .select()
    .from(guardrails)
    .where(
      and(
        eq(guardrails.productId, productId),
        eq(guardrails.recordId, recordId),
      ),
    )
  const guardrail = found.at(0)
  if (!guardrail) return undefined

  return {
    kind: 'guardrail',
    id: guardrail.recordId,
    title: guardrail.title,
    enforcedBy: guardrail.enforcedBy,
    body: guardrail.body,
  }
}

// The first letter of a record id names the kind of the record.
const finders = {
  G: findGoal,
  D: findDecision,
  I: findInsight,
  F: findFact,
  R: findGuardrail,
}

export async function findRecord(
  db: ConceptDb,
  productSlug: string,
  recordId: string,
): Promise<LinkedRecord | undefined> {
  if (!isRecordId(recordId)) return undefined
  const product = await findProduct(db, productSlug)
  if (!product) return undefined

  const find = finders[recordId[0] as keyof typeof finders]
  return find(db, product.id, recordId)
}
