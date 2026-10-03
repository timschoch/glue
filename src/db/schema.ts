import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
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
import type { Kind } from './kinds.ts'

export const projects = pgTable('projects', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // The Product's project key in its analytics tool. Goals read their funnel
  // from this project only, so one Product cannot read another's analytics.
  analyticsProject: text('analytics_project'),
  // The GitHub repository, as owner/name, that builds the Product.
  repository: text('repository'),
  // The Product's handle in its social channel. The measure run reads the
  // public comments under this handle.
  socialHandle: text('social_handle'),
  // When the newest comment the measure run counted was posted. The next run
  // reads after it, so a comment counts once. null: read from the start.
  commentsReadUntil: timestamp('comments_read_until', {
    withTimezone: true,
    precision: 3,
  }),
})

// The highest number that a record id of one folder had in the Product.
// It only grows, so the id of a deleted record does not come back.
export const recordCounters = pgTable(
  'record_counters',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => projects.id),
    folder: text('folder').notNull(),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.folder] })],
)

// A token gives HTTP API access to the Concept of one Product.
// Only the SHA-256 hash of the token is stored.
export const tokens = pgTable('tokens', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  hash: text('hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// A person or an agent with a token closes a Goal. Glue never does.
export const goalStatuses = ['open', 'achieved'] as const
export type GoalStatus = (typeof goalStatuses)[number]

export const goals = pgTable(
  'goals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => projects.id),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    metric: text('metric').notNull(),
    source: text('source').notNull(),
    measure: jsonb('measure').$type<GoalMeasure>(),
    status: text('status').notNull().default('open').$type<GoalStatus>(),
    // A mean measure: the value of the first measure run, and the value of
    // the last run with its time. With a baseline value: the means of the
    // two breakdown values it compares, and the one seen last.
    baseline: doublePrecision('baseline'),
    latestValue: doublePrecision('latest_value'),
    latestBreakdownValue: text('latest_breakdown_value'),
    measuredAt: timestamp('measured_at', { withTimezone: true }),
    body: text('body').notNull().default(''),
  },
  (table) => [
    unique().on(table.productId, table.recordId),
    check('goals_status_check', sql`${table.status} in ('open', 'achieved')`),
  ],
)

export const insightStatuses = ['draft'] as const
export type InsightStatus = (typeof insightStatuses)[number]

export const insights = pgTable(
  'insights',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    productId: integer('product_id')
      .notNull()
      .references(() => projects.id),
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
      .references(() => projects.id),
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
      .references(() => projects.id),
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
      .references(() => projects.id),
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

// The tables of the Part model. They hold the records. The tables of the
// records above are read-only: ticket 135 drops them.

// A Concept is assembled from Parts and holds smaller Concepts. The Concept
// without a parent is the root of its Project.
export const concepts = pgTable(
  'concepts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    parentId: integer('parent_id'),
    // The root takes the slug of its Project.
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    kind: text('kind').$type<Kind>(),
  },
  (table) => [
    unique().on(table.projectId, table.slug),
    // The target of the foreign keys that keep a Concept and a Part inside
    // one Project.
    unique().on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.parentId],
      foreignColumns: [table.projectId, table.id],
    }),
    uniqueIndex('concepts_root_unique')
      .on(table.projectId)
      .where(sql`${table.parentId} is null`),
    check('concepts_kind_check', sql`${table.kind} in ('brief')`),
  ],
)

export const partTypes = [
  'insight',
  'goal',
  'decision',
  'guardrail',
  'entity',
  'flow',
  'metric',
] as const
export type PartType = (typeof partTypes)[number]

// The Part types that a Decision takes as evidence.
export const evidenceTypes = ['insight', 'guardrail'] as const

export const evidenceLevels = ['hunch', 'pattern', 'confirmed'] as const
export type EvidenceLevel = (typeof evidenceLevels)[number]

// A Part is one record of one type. Its home is one Concept.
export const parts = pgTable(
  'parts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id').notNull(),
    conceptId: integer('concept_id').notNull(),
    type: text('type').notNull().$type<PartType>(),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    owner: text('owner'),
    status: text('status'),
    date: date('date'),
    source: text('source'),
    // Goal
    metric: text('metric'),
    // Guardrail
    enforcedBy: text('enforced_by'),
    // Decision: the issue in the Project repository that builds it.
    issueUrl: text('issue_url'),
    // Insight
    evidenceLevel: text('evidence_level').$type<EvidenceLevel>(),
    // Supersede replaces, it does not need. So it is not a Joint.
    supersededById: integer('superseded_by_id').references(
      (): AnyPgColumn => parts.id,
    ),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.conceptId],
      foreignColumns: [concepts.projectId, concepts.id],
    }),
    unique().on(table.projectId, table.recordId),
    index('parts_concept_id_type_index').on(table.conceptId, table.type),
    // The measure run writes one Insight per query, also when two runs
    // overlap. Other sources are free text and may repeat.
    uniqueIndex('parts_measure_source_unique')
      .on(table.projectId, table.source)
      .where(
        sql`${table.type} = 'insight' and ${table.source} like 'mock-analytics://%'`,
      ),
    check(
      'parts_type_check',
      sql`${table.type} in ('insight', 'goal', 'decision', 'guardrail', 'entity', 'flow', 'metric')`,
    ),
    check(
      'parts_evidence_level_check',
      sql`${table.evidenceLevel} in ('hunch', 'pattern', 'confirmed')`,
    ),
    // The fields that each type must have. `coalesce` makes a missing status
    // fail the check: `null in (...)` is null, and a check passes on null.
    check(
      'parts_type_fields_check',
      sql`case ${table.type}
        when 'goal' then coalesce(${table.status}, '') in ('open', 'achieved') and ${table.metric} is not null and ${table.source} is not null
        when 'decision' then coalesce(${table.status}, '') in ('proposed', 'accepted', 'superseded') and ${table.date} is not null and ${table.owner} is not null
        when 'insight' then coalesce(${table.status}, 'draft') = 'draft' and ${table.date} is not null and ${table.source} is not null
        when 'guardrail' then ${table.enforcedBy} is not null and ${table.status} is null
        else ${table.status} is null
      end`,
    ),
  ],
)

// A Joint glues two Parts: `partId` needs `neededPartId`. A two-way Joint
// reads the same from both sides. The order of the ids is the order of the
// evidence of a Decision.
export const joints = pgTable(
  'joints',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    // The database refuses to delete a Part that another Part needs.
    neededPartId: integer('needed_part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    twoWay: boolean('two_way').notNull().default(false),
  },
  (table) => [
    check(
      'joints_parts_differ_check',
      sql`${table.partId} <> ${table.neededPartId}`,
    ),
    // One Joint per pair of Parts, in either direction.
    uniqueIndex('joints_pair_unique').on(
      sql`least(${table.partId}, ${table.neededPartId})`,
      sql`greatest(${table.partId}, ${table.neededPartId})`,
    ),
    index('joints_part_id_index').on(table.partId),
    index('joints_needed_part_id_index').on(table.neededPartId),
  ],
)

// How Glue measures a Part, and the last readings. A Part without a measure
// has no row.
export const measures = pgTable('measures', {
  partId: integer('part_id')
    .primaryKey()
    .references(() => parts.id, { onDelete: 'cascade' }),
  measure: jsonb('measure').notNull().$type<GoalMeasure>(),
  // A mean measure: the value of the first measure run, and the value of
  // the last run with its time. With a baseline value: the means of the
  // two breakdown values it compares, and the one seen last.
  baseline: doublePrecision('baseline'),
  latestValue: doublePrecision('latest_value'),
  latestBreakdownValue: text('latest_breakdown_value'),
  measuredAt: timestamp('measured_at', { withTimezone: true }),
})

// The highest number that a record id of one Part type had in the Project.
// It only grows, so the id of a deleted Part does not come back.
export const partCounters = pgTable(
  'part_counters',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    type: text('type').notNull().$type<PartType>(),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.type] })],
)
