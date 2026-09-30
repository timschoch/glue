import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import type { GoalMeasure } from './goal-measure.ts'

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // The Product's project key in its analytics tool. Goals read their funnel
  // from this project only, so one Product cannot read another's analytics.
  analyticsProject: text('analytics_project'),
  // The GitHub repository, as owner/name, that builds the Product.
  repository: text('repository'),
})

// The highest number that a record id of one folder had in the Product.
// It only grows, so the id of a deleted record does not come back.
export const recordCounters = pgTable(
  'record_counters',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    folder: text('folder').notNull(),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.folder] })],
)

// A token gives HTTP API access to the Concept of one Product.
// Only the SHA-256 hash of the token is stored.
export const tokens = pgTable('tokens', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  name: text('name').notNull(),
  hash: text('hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    measure: jsonb('measure').$type<GoalMeasure>(),
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
  (table) => [
    unique().on(table.productId, table.recordId),
    // The measure run writes one Insight per query, also when two runs
    // overlap. Other sources are free text and may repeat.
    uniqueIndex('insights_measure_source_unique')
      .on(table.productId, table.source)
      .where(sql`${table.source} like 'mock-analytics://%'`),
  ],
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
    // The issue in the Product repository that builds the accepted Decision.
    issueUrl: text('issue_url'),
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
    unique()
      .on(table.decisionId, table.insightId, table.factId)
      .nullsNotDistinct(),
    check(
      'decision_evidence_exactly_one_check',
      sql`num_nonnulls(${table.insightId}, ${table.factId}) = 1`,
    ),
  ],
)
