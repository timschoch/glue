import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { check, date, integer, pgTable, text, unique } from 'drizzle-orm/pg-core'

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const goals = pgTable(
  'goals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    metric: text('metric').notNull(),
    source: text('source').notNull(),
    body: text('body').notNull().default(''),
  },
  (table) => [unique().on(table.productId, table.recordId)],
)

export const insightStatuses = ['draft'] as const
export type InsightStatus = (typeof insightStatuses)[number]

export const insights = pgTable(
  'insights',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    date: date('date').notNull(),
    source: text('source').notNull(),
    status: text('status').$type<InsightStatus | null>(),
    body: text('body').notNull().default(''),
  },
  (table) => [unique().on(table.productId, table.recordId)],
)

export const facts = pgTable(
  'facts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    source: text('source').notNull(),
    body: text('body').notNull().default(''),
  },
  (table) => [unique().on(table.productId, table.recordId)],
)

export const guardrails = pgTable(
  'guardrails',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    enforcedBy: text('enforced_by').notNull(),
    body: text('body').notNull().default(''),
  },
  (table) => [unique().on(table.productId, table.recordId)],
)

export const decisionStatuses = ['proposed', 'accepted', 'superseded'] as const
export type DecisionStatus = (typeof decisionStatuses)[number]

export const decisions = pgTable(
  'decisions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    date: date('date').notNull(),
    owner: text('owner').notNull(),
    status: text('status').notNull().$type<DecisionStatus>(),
    goalId: integer('goal_id')
      .notNull()
      .references(() => goals.id),
    supersededById: integer('superseded_by_id').references(
      (): AnyPgColumn => decisions.id,
    ),
    body: text('body').notNull().default(''),
  },
  (table) => [
    unique().on(table.productId, table.recordId),
    check(
      'decisions_status_check',
      sql`${table.status} in ('proposed', 'accepted', 'superseded')`,
    ),
  ],
)

export const decisionEvidence = pgTable(
  'decision_evidence',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    decisionId: integer('decision_id')
      .notNull()
      .references(() => decisions.id),
    insightId: integer('insight_id').references(() => insights.id),
    factId: integer('fact_id').references(() => facts.id),
  },
  (table) => [
    unique().on(table.decisionId, table.insightId, table.factId),
    check(
      'decision_evidence_exactly_one_check',
      sql`num_nonnulls(${table.insightId}, ${table.factId}) = 1`,
    ),
  ],
)
