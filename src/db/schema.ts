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

export const evidenceLevels = ['hunch', 'pattern', 'confirmed'] as const
export type EvidenceLevel = (typeof evidenceLevels)[number]

// Trust is for the reader of a Part (D27, D39).
export const trusts = ['solid', 'flagged', 'not-ready', 'wrong'] as const
export type Trust = (typeof trusts)[number]

// The Work state is for the owner of a Part. A sunk Part is at its end.
export const workStates = [
  'to-check',
  'waiting',
  'draft',
  'review',
  'published',
  'sunk',
] as const
export type WorkState = (typeof workStates)[number]

// What a Decision asks, and the answer that it got (D27). `pick` and
// `option` count the options from 1.
export type Question = {
  options: string[]
  // The option that the author would take.
  pick: number | null
  // The option that the person chose, or the answer in words.
  answer: {
    option: number | null
    text: string | null
    by: string
    at: string
  } | null
}

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
    // Decision: its options and its answer.
    question: jsonb('question').$type<Question>(),
    // Insight
    evidenceLevel: text('evidence_level').$type<EvidenceLevel>(),
    // Supersede replaces, it does not need. So it is not a Joint.
    supersededById: integer('superseded_by_id').references(
      (): AnyPgColumn => parts.id,
    ),
    // A Part starts as a draft that nobody relies on. The status of a
    // Decision and of an Insight moves with these two in the same write.
    trust: text('trust').notNull().default('not-ready').$type<Trust>(),
    workState: text('work_state').notNull().default('draft').$type<WorkState>(),
    // The Part that a waiting Part waits on.
    awaitedPartId: integer('awaited_part_id').references(
      (): AnyPgColumn => parts.id,
      { onDelete: 'set null' },
    ),
    // The last write to the Part. Mine shows the newest change first.
    changedAt: timestamp('changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // The first time that the Part was published. A Part that is published
    // again tells the Parts that need it.
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.conceptId],
      foreignColumns: [concepts.projectId, concepts.id],
    }),
    unique().on(table.projectId, table.recordId),
    check(
      'parts_trust_check',
      sql`${table.trust} in ('solid', 'flagged', 'not-ready', 'wrong')`,
    ),
    check(
      'parts_work_state_check',
      sql`${table.workState} in ('to-check', 'waiting', 'draft', 'review', 'published', 'sunk')`,
    ),
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
    // The body of `partId` names `neededPartId`, and that added the Joint
    // (D37). It goes with the mention. A Joint that a person added stays.
    mentioned: boolean('mentioned').notNull().default(false),
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

export const flagReasons = [
  'changed',
  'not-ready',
  'wrong',
  'off-target',
] as const
export type FlagReason = (typeof flagReasons)[number]

// A flag tells the owner of `partId` to look: `causePartId`, a Part that it
// needs, changed, or is not ready, or is wrong, or has a reading that misses
// its target. An answer closes the flag.
export const flags = pgTable(
  'flags',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    causePartId: integer('cause_part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull().$type<FlagReason>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'flags_reason_check',
      sql`${table.reason} in ('changed', 'not-ready', 'wrong', 'off-target')`,
    ),
    // One open flag per cause and reason. A second reason is a second flag.
    uniqueIndex('flags_open_unique')
      .on(table.partId, table.causePartId, table.reason)
      .where(sql`${table.closedAt} is null`),
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

// A Signal that an Insight grew from (D30). The Signal stays in its tool:
// Glue keeps its address and its title. A Signal grows into one Insight.
export const signals = pgTable(
  'signals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    url: text('url').notNull(),
    title: text('title').notNull(),
    // The Insight.
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique().on(table.projectId, table.url),
    index('signals_part_id_index').on(table.partId),
  ],
)

// A Part as a Contract Version holds it: its content at the time of the
// sign-off. `needs` has the record ids of the Parts that it needs.
export type FrozenPart = {
  id: string
  type: PartType
  title: string
  body: string
  // The slug of the home Concept.
  concept: string
  status: string | null
  owner: string | null
  date: string | null
  source: string | null
  metric: string | null
  enforcedBy: string | null
  evidenceLevel: EvidenceLevel | null
  needs: string[]
}

// A Contract Version is the Parts of a Concept, and of the Concepts in it,
// as they were at one sign-off (D28). A row never changes.
export const contractVersions = pgTable(
  'contract_versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    conceptId: integer('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    // The SHA-256 of `parts` as text.
    checksum: text('checksum').notNull(),
    parts: jsonb('parts').notNull().$type<FrozenPart[]>(),
    signedBy: text('signed_by').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.conceptId, table.version)],
)

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

// The steps of the loop in docs/concept.md, section 1.
export const loopSteps = [
  'understand',
  'decide',
  'design',
  'build',
  'use',
] as const
export type LoopStep = (typeof loopSteps)[number]

// A member of a Project: an account of Neon Auth that writes to the Project
// in the app (D31). The name and the e-mail address are the ones of the
// account at the time it became a member.
export const members = pgTable(
  'members',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    // The id of the account in Neon Auth.
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    // The usual loop steps of the member.
    loopSteps: text('loop_steps')
      .array()
      .notNull()
      .default(sql`'{}'`)
      .$type<LoopStep[]>(),
  },
  (table) => [
    unique().on(table.projectId, table.userId),
    check(
      'members_loop_steps_check',
      sql`${table.loopSteps} <@ array['understand', 'decide', 'design', 'build', 'use']`,
    ),
  ],
)

export const assignmentRoles = ['responsible', 'co-author'] as const
export type AssignmentRole = (typeof assignmentRoles)[number]

// An assignment gives a member a Concept or a Part: as Responsible, the main
// point of contact, or as Co-Author.
export const assignments = pgTable(
  'assignments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    conceptId: integer('concept_id').references(() => concepts.id, {
      onDelete: 'cascade',
    }),
    partId: integer('part_id').references(() => parts.id, {
      onDelete: 'cascade',
    }),
    role: text('role').notNull().$type<AssignmentRole>(),
  },
  (table) => [
    // A member has one role on a Concept or a Part.
    unique()
      .on(table.memberId, table.conceptId, table.partId)
      .nullsNotDistinct(),
    check(
      'assignments_one_target_check',
      sql`num_nonnulls(${table.conceptId}, ${table.partId}) = 1`,
    ),
    check(
      'assignments_role_check',
      sql`${table.role} in ('responsible', 'co-author')`,
    ),
    index('assignments_part_id_index').on(table.partId),
  ],
)
