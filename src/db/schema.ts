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
  // The address of the Product's help desk. Its tickets are Signals.
  supportUrl: text('support_url'),
  // When the newest comment the measure run counted was posted. The next run
  // reads after it, so a comment counts once. null: read from the start.
  commentsReadUntil: timestamp('comments_read_until', {
    withTimezone: true,
    precision: 3,
  }),
})

// The Projects that a Project may reference (D45): a Part of `projectId`
// can need a published Part of `referencedProjectId`. No row: no Joint
// crosses the edge between the two Projects.
export const projectReferences = pgTable(
  'project_references',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    referencedProjectId: integer('referenced_project_id')
      .notNull()
      .references(() => projects.id),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.referencedProjectId] }),
    check(
      'project_references_projects_differ_check',
      sql`${table.projectId} <> ${table.referencedProjectId}`,
    ),
  ],
)

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

// A Kind lists the slots that a Concept of it fills (glue/D57). Each Project
// has its own Kinds and starts with the Kind Brief.
export const kinds = pgTable(
  'kinds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
  },
  (table) => [
    unique().on(table.projectId, table.slug),
    // The target of the foreign key that keeps a Concept and its Kind inside
    // one Project.
    unique().on(table.projectId, table.id),
  ],
)

// One slot of a Kind: the Part type, and the least count of Parts that fill
// it. A sign-off needs each required slot filled.
export const kindSlots = pgTable(
  'kind_slots',
  {
    kindId: integer('kind_id')
      .notNull()
      .references(() => kinds.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<PartType>(),
    required: boolean('required').notNull().default(true),
    // 1: what a coding agent reads. 2: the why.
    tier: integer('tier').notNull().$type<1 | 2>(),
    minCount: integer('min_count').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.kindId, table.type] }),
    check(
      'kind_slots_type_check',
      sql`${table.type} in ('insight', 'goal', 'decision', 'guardrail', 'entity', 'flow', 'metric')`,
    ),
    check('kind_slots_tier_check', sql`${table.tier} in (1, 2)`),
    check('kind_slots_min_count_check', sql`${table.minCount} >= 1`),
  ],
)

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
    // Read-only: the Kind of a Concept is `kindId`. A later migration drops
    // this column with its check.
    kind: text('kind'),
    kindId: integer('kind_id'),
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
    foreignKey({
      columns: [table.projectId, table.kindId],
      foreignColumns: [kinds.projectId, kinds.id],
    }),
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

// One step of a Flow. The steps of a Flow keep their order.
export type FlowStep = {
  text: string
  // The record id of the Entity of the same Project that the step works on.
  entity: string | null
}

// One field of an Entity: its name, and what it means.
export type EntityField = { name: string; meaning: string }

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
    // Flow
    steps: jsonb('steps').notNull().default([]).$type<FlowStep[]>(),
    // Entity
    fields: jsonb('fields').notNull().default([]).$type<EntityField[]>(),
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
    // The last wording fix: a new title or body with the same meaning.
    wordingAt: timestamp('wording_at', { withTimezone: true }),
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
    // The Contract Version of the home Concept of `neededPartId` that
    // `partId` was built with (D46). Only a Joint to a Part of a different
    // Concept has one. null: the Joint is glued to the live Part.
    contractVersion: integer('contract_version'),
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
  'new-version',
] as const
export type FlagReason = (typeof flagReasons)[number]

// A flag tells the owner of `partId` to look: `causePartId`, a Part that it
// needs, changed, or is not ready, or is wrong, or has a reading that misses
// its target, or is different in a new Contract Version of its Concept. An
// answer closes the flag.
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
      sql`${table.reason} in ('changed', 'not-ready', 'wrong', 'off-target', 'new-version')`,
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
  // Only a Flow with steps has them, and only an Entity with fields. So a
  // Version from before the lists keeps its checksum.
  steps?: FlowStep[]
  fields?: EntityField[]
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

// A question of a builder about a Contract Version of the Concept
// (glue/D62). `askedBy` and `answeredBy` are names: of a member, or of who
// holds a token. No answer: the question is open.
export const contractQuestions = pgTable(
  'contract_questions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    conceptId: integer('concept_id').notNull(),
    // The Contract Version that the builder builds with.
    version: integer('version').notNull(),
    text: text('text').notNull(),
    askedBy: text('asked_by').notNull(),
    askedAt: timestamp('asked_at', { withTimezone: true }).notNull(),
    answer: text('answer'),
    answeredBy: text('answered_by'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (table) => [
    // A question names a Version that the Concept has.
    foreignKey({
      columns: [table.conceptId, table.version],
      foreignColumns: [contractVersions.conceptId, contractVersions.version],
    }).onDelete('cascade'),
    check(
      'contract_questions_answer_check',
      sql`num_nonnulls(${table.answer}, ${table.answeredBy}, ${table.answeredAt}) in (0, 3)`,
    ),
    index('contract_questions_concept_id_index').on(table.conceptId),
  ],
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

// A member watches a Part (D47): the Part shows in Mine of the member, in a
// group of its own. Watching is not owning: the owner of a Part is its
// Responsible.
export const watchers = pgTable(
  'watchers',
  {
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.partId, table.memberId] }),
    index('watchers_member_id_index').on(table.memberId),
  ],
)

// A flag that a member saw (glue/D61). A flag with no row is new for the
// member. A second reason is a second flag, so it is new again.
export const seenFlags = pgTable(
  'seen_flags',
  {
    flagId: integer('flag_id')
      .notNull()
      .references(() => flags.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.flagId, table.memberId] }),
    index('seen_flags_member_id_index').on(table.memberId),
  ],
)

// The fields of a Part that a Part Version holds next to its title and its
// body.
export type VersionFields = {
  status: string | null
  owner: string | null
  date: string | null
  source: string | null
  metric: string | null
  enforcedBy: string | null
  evidenceLevel: EvidenceLevel | null
  // A Version from before the lists has none.
  steps?: FlowStep[]
  fields?: EntityField[]
}

// A Part Version is a Part as it was at one sign-off (glue/D55). Its number
// counts up per Part. A row never changes. No member: a token signed it off.
export const partVersions = pgTable(
  'part_versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    fields: jsonb('fields').notNull().$type<VersionFields>(),
    memberId: integer('member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    signedAt: timestamp('signed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.partId, table.version)],
)

// What a line of the activity of a Part says: the Work state that the Part
// stepped to, an edit, a wording fix, or a step of the Evidence level of an
// Insight (glue/D60): a member raised a Hunch, verified a Pattern, or
// disputed a Confirmed Insight.
export const activityKinds = [
  ...workStates,
  'changed',
  'wording',
  'raised',
  'verified',
  'disputed',
] as const
export type ActivityKind = (typeof activityKinds)[number]

// One line of the activity of a Part (glue/D55): a step of its Work state
// or a change, with the member and the time. `version` is the Part Version
// that the step signed off. No member: a token wrote it, or Glue did. The
// flags of a Part keep their own times: see `flags`. `note` is what the
// member said with a step of the Evidence level: the second source that
// agrees, what was tested, or why the Insight is disputed.
export const partActivity = pgTable(
  'part_activity',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<ActivityKind>(),
    version: integer('version'),
    memberId: integer('member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
  },
  (table) => [
    check(
      'part_activity_kind_check',
      sql`${table.kind} in ('to-check', 'waiting', 'draft', 'review', 'published', 'sunk', 'changed', 'wording', 'raised', 'verified', 'disputed')`,
    ),
    index('part_activity_part_id_index').on(table.partId),
  ],
)

// What an Ask asks for: the check of a Hunch, which gives an Insight
// (glue/D51), or a Decision (glue/D56).
export const askKinds = ['insight', 'decision'] as const
export type AskKind = (typeof askKinds)[number]

// An Ask (glue/D51, glue/D56): the Part `partId` asks the Project
// `projectId` for a Part of the `kind`. A member of that Project picks the
// Ask and hands back a published Part of the own Project. The Ask is done
// when the Part that asks needs that Part. Nothing moves and nothing is
// copied.
export const asks = pgTable(
  'asks',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind').notNull().default('insight').$type<AskKind>(),
    // The Part that waits for the answer. An Ask for an Insight: a Hunch.
    partId: integer('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    // The Project that is asked.
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    // What the member who asks wants to know.
    question: text('question'),
    // The member who made the Ask. An Ask from before glue/D56 has none.
    askedById: integer('asked_by_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    // The member of the asked Project who picked the Ask.
    pickedById: integer('picked_by_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    // The Part of the asked Project that was handed back.
    handedBackPartId: integer('handed_back_part_id').references(
      () => parts.id,
      { onDelete: 'set null' },
    ),
    askedAt: timestamp('asked_at', { withTimezone: true }).notNull(),
    pickedAt: timestamp('picked_at', { withTimezone: true }),
    handedBackAt: timestamp('handed_back_at', { withTimezone: true }),
  },
  (table) => [
    check('asks_kind_check', sql`${table.kind} in ('insight', 'decision')`),
    index('asks_part_id_index').on(table.partId),
    index('asks_project_id_index').on(table.projectId),
  ],
)

export const gateResults = ['holds', 'breaks'] as const
export type GateResult = (typeof gateResults)[number]

// What the gate saw of a Guardrail on the head commit of a build (glue/D59).
// `by-person`: no check of the repository enforces the Guardrail.
export const guardrailStates = [
  'passed',
  'failed',
  'waiting',
  'by-person',
] as const
export type GuardrailState = (typeof guardrailStates)[number]

// A Guardrail of the Contract Version of a build, as the gate saw it.
export type GateGuardrail = {
  id: string
  title: string
  // The slug of the home Concept.
  concept: string
  enforcedBy: string
  state: GuardrailState
}

// What the gate said about a build the last time (glue/D48). A build is a
// pull request of the repository of the Project, by its number. The pull
// request stays in GitHub.
export const buildGates = pgTable(
  'build_gates',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    result: text('result').notNull().$type<GateResult>(),
    // Why the build breaks. None: it holds.
    reasons: jsonb('reasons').notNull().$type<string[]>(),
    // The Guardrails of the Contract Version that the build names.
    guardrails: jsonb('guardrails')
      .notNull()
      .default([])
      .$type<GateGuardrail[]>(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.number] })],
)
