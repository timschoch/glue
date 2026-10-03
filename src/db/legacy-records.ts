import type { SQL } from 'drizzle-orm'
import { and, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { ConceptDb } from './client.ts'
import { CONCEPT_FIELDS } from './concept-fields.ts'
import type {
  ConceptFolder,
  ConceptListRow,
  ConceptShowResult,
} from './concept-records.ts'
import { findProduct, getProjectId } from './concept.ts'
import type {
  Concept,
  Decision,
  Goal,
  Guardrail,
  Insight,
  RecordReference,
} from './concept.ts'
import { sortById, typeOfRecordId } from './record-id.ts'
import * as schema from './schema.ts'

// The record shapes of today, read from the tables of the Part model. The
// screens, the HTTP API and the CLI of today read these until each has its
// own read of Parts.

const { projects, parts, joints, measures } = schema

// The check `parts_type_fields_check` guards the fields that a type must
// have. So a field of its type reads as set, and a status as one of its type.
const goalStatus = sql<schema.GoalStatus>`${parts.status}`
const decisionStatus = sql<schema.DecisionStatus>`${parts.status}`
const insightStatus = sql<schema.InsightStatus | null>`${parts.status}`
const date = sql<string>`${parts.date}`
const owner = sql<string>`${parts.owner}`
const source = sql<string>`${parts.source}`
const metric = sql<string>`${parts.metric}`
const enforcedBy = sql<string>`${parts.enforcedBy}`

const reference = { id: parts.recordId, title: parts.title }

function isType(projectId: number, type: schema.PartType) {
  return and(eq(parts.projectId, projectId), eq(parts.type, type))
}

function isRecord(projectId: number, type: schema.PartType, recordId: string) {
  return and(isType(projectId, type), eq(parts.recordId, recordId))
}

type DecisionLinks = { goal?: RecordReference; evidence: RecordReference[] }

// The Goal and the evidence of each Decision that matches, by the row id of
// the Decision. The evidence is the Insights and Guardrails that the
// Decision needs, in Joint order.
async function listDecisionLinks(db: ConceptDb, matches: SQL | undefined) {
  const needed = alias(parts, 'needed')
  const rows = await db
    .select({
      decisionId: joints.partId,
      type: needed.type,
      id: needed.recordId,
      title: needed.title,
    })
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .innerJoin(needed, eq(joints.neededPartId, needed.id))
    .where(
      and(
        eq(parts.type, 'decision'),
        inArray(needed.type, ['goal', ...schema.evidenceTypes]),
        matches,
      ),
    )
    .orderBy(joints.id)

  const links = new Map<number, DecisionLinks>()
  for (const { decisionId, type, ...neededPart } of rows) {
    const decisionLinks = links.get(decisionId) ?? { evidence: [] }
    if (type === 'goal') decisionLinks.goal ??= neededPart
    else decisionLinks.evidence.push(neededPart)
    links.set(decisionId, decisionLinks)
  }
  return links
}

// The Concept of today has one list per folder. Fact is no longer a type, so
// its list is empty. A Decision without a Goal has no shape of today and is
// left out.
export async function findConcept(
  db: ConceptDb,
  projectSlug: string,
): Promise<Concept | undefined> {
  const project = await findProduct(db, projectSlug)
  if (!project) return undefined

  const [goalRows, decisionRows, links, guardrailRows, insightRows] =
    await Promise.all([
      db
        .select({
          id: parts.recordId,
          title: parts.title,
          metric,
          status: goalStatus,
          latestValue: measures.latestValue,
        })
        .from(parts)
        .leftJoin(measures, eq(measures.partId, parts.id))
        .where(isType(project.id, 'goal')),
      db
        .select({
          rowId: parts.id,
          id: parts.recordId,
          title: parts.title,
          date,
          owner,
          status: decisionStatus,
        })
        .from(parts)
        .where(isType(project.id, 'decision')),
      listDecisionLinks(db, eq(parts.projectId, project.id)),
      db
        .select({ id: parts.recordId, title: parts.title, enforcedBy })
        .from(parts)
        .where(isType(project.id, 'guardrail')),
      db
        .select({
          id: parts.recordId,
          title: parts.title,
          date,
          status: insightStatus,
        })
        .from(parts)
        .where(isType(project.id, 'insight')),
    ])

  return {
    product: { slug: project.slug, name: project.name },
    goals: sortById(goalRows),
    decisions: sortById(
      decisionRows.flatMap(({ rowId, ...decision }) => {
        const { goal, evidence } = links.get(rowId) ?? { evidence: [] }
        return goal ? [{ ...decision, goal, evidence }] : []
      }),
    ),
    guardrails: sortById(guardrailRows),
    insights: sortById(insightRows),
    facts: [],
  }
}

// The Decisions that need the Part, by the row id of the Part.
async function listDecisionsThatNeed(db: ConceptDb, neededPartId: number) {
  const decisions = await db
    .select(reference)
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .where(
      and(eq(joints.neededPartId, neededPartId), eq(parts.type, 'decision')),
    )
  return sortById(decisions)
}

// A Goal with its measure and the last readings. A Goal without a measure
// has no row in `measures`, so these fields are null.
async function findGoalRow(db: ConceptDb, projectId: number, recordId: string) {
  const found = await db
    .select({
      rowId: parts.id,
      ...reference,
      metric,
      source,
      measure: measures.measure,
      status: goalStatus,
      baseline: measures.baseline,
      latestValue: measures.latestValue,
      latestBreakdownValue: measures.latestBreakdownValue,
      measuredAt: measures.measuredAt,
      body: parts.body,
    })
    .from(parts)
    .leftJoin(measures, eq(measures.partId, parts.id))
    .where(isRecord(projectId, 'goal', recordId))
  return found.at(0)
}

async function findGoal(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<Goal | undefined> {
  const goal = await findGoalRow(db, projectId, recordId)
  if (!goal) return undefined
  const { rowId, measuredAt, ...fields } = goal

  return {
    kind: 'goal',
    ...fields,
    measuredAt: measuredAt?.toISOString() ?? null,
    decisions: await listDecisionsThatNeed(db, rowId),
  }
}

async function findDecision(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<Decision | undefined> {
  const superseding = alias(parts, 'superseding')
  const found = await db
    .select({
      rowId: parts.id,
      ...reference,
      date,
      owner,
      status: decisionStatus,
      body: parts.body,
      issueUrl: parts.issueUrl,
      supersededById: superseding.recordId,
      supersededByTitle: superseding.title,
    })
    .from(parts)
    .leftJoin(superseding, eq(parts.supersededById, superseding.id))
    .where(isRecord(projectId, 'decision', recordId))
  const decision = found.at(0)
  if (!decision) return undefined
  const { rowId, supersededById, supersededByTitle, ...fields } = decision

  const [links, supersedes] = await Promise.all([
    listDecisionLinks(db, eq(parts.id, rowId)),
    db.select(reference).from(parts).where(eq(parts.supersededById, rowId)),
  ])
  const { goal, evidence } = links.get(rowId) ?? { evidence: [] }
  if (!goal) return undefined

  return {
    kind: 'decision',
    ...fields,
    goal,
    evidence,
    supersededBy:
      supersededById !== null && supersededByTitle !== null
        ? { id: supersededById, title: supersededByTitle }
        : null,
    supersedes: sortById(supersedes),
  }
}

async function findInsight(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<Insight | undefined> {
  const found = await db
    .select({
      rowId: parts.id,
      ...reference,
      date,
      source,
      status: insightStatus,
      evidenceLevel: parts.evidenceLevel,
      body: parts.body,
    })
    .from(parts)
    .where(isRecord(projectId, 'insight', recordId))
  const insight = found.at(0)
  if (!insight) return undefined
  const { rowId, ...fields } = insight

  return {
    kind: 'insight',
    ...fields,
    decisions: await listDecisionsThatNeed(db, rowId),
  }
}

async function findGuardrail(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<Guardrail | undefined> {
  const found = await db
    .select({
      ...reference,
      enforcedBy,
      source: parts.source,
      body: parts.body,
    })
    .from(parts)
    .where(isRecord(projectId, 'guardrail', recordId))
  const guardrail = found.at(0)
  return guardrail && { kind: 'guardrail', ...guardrail }
}

// A record of today, with its links in both directions.
export type LegacyRecord = Goal | Decision | Insight | Guardrail

type Finder = (
  db: ConceptDb,
  projectId: number,
  recordId: string,
) => Promise<LegacyRecord | undefined>

// The Part types that have a record shape of today. F is the letter of a
// Flow now, and the id of a Fact is dropped (D38). So an F id has no record
// of today.
const finders: Partial<Record<schema.PartType, Finder>> = {
  goal: findGoal,
  decision: findDecision,
  insight: findInsight,
  guardrail: findGuardrail,
}

export async function findRecord(
  db: ConceptDb,
  projectSlug: string,
  recordId: string,
): Promise<LegacyRecord | undefined> {
  const find = finders[typeOfRecordId(recordId) ?? 'flow']
  if (!find) return undefined
  const project = await findProduct(db, projectSlug)
  if (!project) return undefined

  return find(db, project.id, recordId)
}

// The open Goals with a measure, each with the Project that holds it: of all
// Projects, or of the one of the slug. The measure is as stored, not parsed.
// `goalId` is the row id of the Part.
export function listGoalsWithMeasure(db: ConceptDb, projectSlug?: string) {
  return db
    .select({
      productId: projects.id,
      productSlug: projects.slug,
      analyticsProject: projects.analyticsProject,
      goalId: parts.id,
      goalRecordId: parts.recordId,
      baseline: measures.baseline,
      measure: measures.measure,
    })
    .from(parts)
    .innerJoin(measures, eq(measures.partId, parts.id))
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(
      and(
        eq(parts.type, 'goal'),
        eq(parts.status, 'open'),
        projectSlug === undefined ? undefined : eq(projects.slug, projectSlug),
      ),
    )
    .orderBy(parts.id)
}

// The accepted Decisions that need the Goal, by the row id of the Goal.
export async function listAcceptedDecisions(
  db: ConceptDb,
  goalId: number,
): Promise<RecordReference[]> {
  const accepted = await db
    .select(reference)
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .where(
      and(
        eq(joints.neededPartId, goalId),
        eq(parts.type, 'decision'),
        eq(parts.status, 'accepted'),
      ),
    )
  return sortById(accepted)
}

// The id of the Insight of the Project with this source, or null.
export async function findInsightIdBySource(
  db: ConceptDb,
  projectId: number,
  insightSource: string,
) {
  const found = await db
    .select({ id: parts.recordId })
    .from(parts)
    .where(and(isType(projectId, 'insight'), eq(parts.source, insightSource)))
  return found.at(0)?.id ?? null
}

// The source and the date of each Insight of the Project. An unknown Project
// has none.
export function listInsightSources(db: ConceptDb, projectSlug: string) {
  return db
    .select({ id: parts.recordId, source, date })
    .from(parts)
    .innerJoin(projects, eq(parts.projectId, projects.id))
    .where(and(eq(projects.slug, projectSlug), eq(parts.type, 'insight')))
}

// The folders of today in the order of the list, each with its Part type.
const FOLDER_TYPES = Object.entries(CONCEPT_FIELDS).map(
  ([folder, { type }]) => ({ folder, type }),
)

// The list leaves out what the show does not find: a Decision without a
// Goal has no shape of today.
export async function listConceptRecords(
  db: ConceptDb,
  projectSlug: string,
  folder?: ConceptFolder,
): Promise<ConceptListRow[]> {
  const projectId = await getProjectId(db, projectSlug)
  const hasGoal = sql`exists (
    select 1 from "joints" as joint, "parts" as needed
    where joint."part_id" = ${parts.id}
      and needed."id" = joint."needed_part_id"
      and needed."type" = 'goal'
  )`
  const rows = await db
    .select({ type: parts.type, ...reference, status: parts.status })
    .from(parts)
    .where(
      and(
        eq(parts.projectId, projectId),
        or(ne(parts.type, 'decision'), hasGoal),
      ),
    )

  return FOLDER_TYPES.filter(
    (listed) => folder === undefined || listed.folder === folder,
  ).flatMap(({ type }) =>
    sortById(
      rows
        .filter((row) => row.type === type)
        .map(({ id, title, status }) => ({ id, status: status ?? '', title })),
    ),
  )
}

type ShownRecord = Omit<ConceptShowResult, 'id' | 'folder'>

async function showGoal(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<ShownRecord | undefined> {
  const goal = await findGoalRow(db, projectId, recordId)
  if (!goal) return undefined
  const { rowId: _rowId, id: _id, body, ...fields } = goal
  return { fields, body }
}

async function showDecision(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<ShownRecord | undefined> {
  const decision = await findDecision(db, projectId, recordId)
  if (!decision) return undefined
  // What it needs next to its Goal and its evidence: a Part of any other
  // type.
  const needed = alias(parts, 'needed')
  const needs = await db
    .select({ id: needed.recordId, title: needed.title })
    .from(joints)
    .innerJoin(parts, eq(joints.partId, parts.id))
    .innerJoin(needed, eq(joints.neededPartId, needed.id))
    .where(
      and(
        isRecord(projectId, 'decision', recordId),
        notInArray(needed.type, ['goal', ...schema.evidenceTypes]),
      ),
    )
    .orderBy(joints.id)
  return {
    fields: {
      title: decision.title,
      date: decision.date,
      owner: decision.owner,
      status: decision.status,
      ...(decision.issueUrl && { issue: decision.issueUrl }),
    },
    body: decision.body,
    goal: decision.goal,
    evidence: decision.evidence,
    needs,
    supersededBy: decision.supersededBy?.id,
    supersedes: decision.supersedes.map(({ id }) => id),
  }
}

async function showInsight(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<ShownRecord | undefined> {
  const insight = await findInsight(db, projectId, recordId)
  if (!insight) return undefined
  const {
    kind: _kind,
    id: _id,
    body,
    decisions: _decisions,
    ...fields
  } = insight
  return { fields, body }
}

async function showGuardrail(
  db: ConceptDb,
  projectId: number,
  recordId: string,
): Promise<ShownRecord | undefined> {
  const guardrail = await findGuardrail(db, projectId, recordId)
  if (!guardrail) return undefined
  const { kind: _kind, id: _id, body, ...fields } = guardrail
  return { fields, body }
}

// The folder of the Facts has no entry: Fact is no longer a type (D26).
const showers: Partial<Record<ConceptFolder, typeof showGoal>> = {
  goals: showGoal,
  decisions: showDecision,
  insights: showInsight,
  guardrails: showGuardrail,
}

export async function showConceptRecord(
  db: ConceptDb,
  projectSlug: string,
  id: string,
): Promise<ConceptShowResult> {
  const projectId = await getProjectId(db, projectSlug)
  const type = typeOfRecordId(id)
  if (!type) throw new Error(`"${id}" is not a Concept id`)

  // An Entity, a Flow and a Metric have no folder: these views do not show
  // them.
  const folder = (Object.keys(showers) as ConceptFolder[]).find(
    (shown) => CONCEPT_FIELDS[shown].type === type,
  )
  const record = folder && (await showers[folder]?.(db, projectId, id))
  if (!folder || !record) throw new Error(`"${id}" not found`)
  return { id, folder, ...record }
}
