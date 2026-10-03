import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { GithubClient } from '../github/client.ts'
import { createDownstreamIssue } from '../github/downstream-issue.ts'
import type { DownstreamIssue } from '../github/downstream-issue.ts'
import { CONCEPT_FIELDS } from './concept-fields.ts'
import type { ConceptDb } from './client.ts'
import { goalMeasureSchema } from './goal-measure.ts'
import type { GoalMeasure } from './goal-measure.ts'
import {
  addPart,
  addProject,
  removePart,
  supersedeDecision,
  todayUtc,
  updatePart,
} from './part-records.ts'
import { findPart } from './parts.ts'
import { InvalidRecordError, ProductNotFoundError } from './record-errors.ts'
import { sortById, typeOfRecordId } from './record-id.ts'
import * as schema from './schema.ts'

// The writes of the records of today. Each one takes the shape that the
// screens, the HTTP API and the CLI send, and writes Parts with
// part-records.ts.

export type ConceptFolder = keyof typeof CONCEPT_FIELDS

export type ConceptFields = Record<
  string,
  string | string[] | GoalMeasure | undefined
>

export type ConceptListRow = { id: string; status: string; title: string }

export type ConceptShowResult = {
  id: string
  folder: ConceptFolder
  fields: Record<string, unknown>
  body: string
  goal?: { id: string; title: string }
  evidence?: { id: string; title: string }[]
  // The Parts that a Decision needs next to its Goal and its evidence.
  needs?: { id: string; title: string }[]
  supersededBy?: string
  supersedes?: string[]
}

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/

export async function setProductRepository(
  db: ConceptDb,
  productSlug: string,
  repository: string,
): Promise<void> {
  if (!REPOSITORY.test(repository)) {
    throw new InvalidRecordError(
      `repository "${repository}" must look like owner/name`,
    )
  }
  const updated = await db
    .update(schema.projects)
    .set({ repository })
    .where(eq(schema.projects.slug, productSlug))
    .returning({ id: schema.projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

function isMissing(value: ConceptFields[string]) {
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
    if (isMissing(fields[field]))
      throw new InvalidRecordError(`"${field}" is required`)
  }
  if (
    folder === 'decisions' &&
    fields.status === 'superseded' &&
    isMissing(fields.superseded_by)
  ) {
    throw new InvalidRecordError('a superseded Decision needs "superseded_by"')
  }
  if (
    folder === 'decisions' &&
    !isMissing(fields.supersedes) &&
    fields.status !== 'accepted'
  ) {
    throw new InvalidRecordError('"supersedes" needs the status "accepted"')
  }
}

// The letter of a record id names its type. An id with the letter of
// another type is not a record of the type that the request asks for.
function requireType(
  id: string,
  types: readonly schema.PartType[],
  name: string = types[0],
) {
  const type = typeOfRecordId(id)
  if (!type || !types.includes(type))
    throw new InvalidRecordError(`${name} "${id}" not found`)
  return id
}

// What an add of a Fact answers.
export const FACT_REMOVED =
  'Fact is no longer a type (D26): add an Insight or a Guardrail.'

export async function addConceptRecord(
  db: ConceptDb,
  productSlug: string,
  folder: ConceptFolder,
  inputFields: ConceptFields,
  body: string,
): Promise<string> {
  if (folder === 'facts') throw new InvalidRecordError(FACT_REMOVED)
  const shouldDefaultDate =
    (folder === 'decisions' || folder === 'insights') &&
    isMissing(inputFields.date)
  const fields = shouldDefaultDate
    ? { ...inputFields, date: todayUtc() }
    : inputFields
  validateFields(folder, fields)

  // A Decision serves a Goal, so its Product exists already.
  if (folder !== 'decisions') await addProject(db, productSlug)

  const title = fields.title as string
  const concept = fields.concept as string | undefined
  switch (folder) {
    case 'goals':
      return addPart(db, productSlug, {
        type: 'goal',
        concept,
        title,
        metric: fields.metric as string,
        source: fields.source as string,
        measure: fields.measure as GoalMeasure | undefined,
        body,
      })
    case 'insights':
      return addPart(db, productSlug, {
        type: 'insight',
        concept,
        title,
        date: fields.date as string,
        source: fields.source as string,
        status: fields.status as schema.InsightStatus | undefined,
        evidenceLevel: fields.evidence_level as
          schema.EvidenceLevel | undefined,
        body,
      })
    case 'guardrails':
      return addPart(db, productSlug, {
        type: 'guardrail',
        concept,
        title,
        enforcedBy: fields.enforced_by as string,
        source: fields.source as string | undefined,
        body,
      })
    case 'decisions': {
      const evidence = Array.isArray(fields.evidence) ? fields.evidence : []
      if (evidence.length === 0)
        throw new InvalidRecordError('"evidence" is required')
      return addPart(db, productSlug, {
        type: 'decision',
        concept,
        title,
        date: fields.date as string,
        owner: fields.owner as string,
        status: fields.status as schema.DecisionStatus,
        needs: [
          requireType(fields.goal as string, ['goal']),
          ...evidence.map((id) =>
            requireType(id, schema.evidenceTypes, 'evidence'),
          ),
          ...(Array.isArray(fields.needs) ? fields.needs : []),
        ],
        supersedes: fields.supersedes as string | undefined,
        supersededBy: fields.superseded_by as string | undefined,
        body,
      })
    }
  }
}

// What a write of a Decision gives back: its id, and what became of its
// downstream issue.
export type DecisionChange = { id: string; issue: DownstreamIssue }

// Every write that can leave a Decision accepted ends here, so the CLI, the
// HTTP API and the app all open the downstream issue.
async function openDownstream(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  id: string,
): Promise<DecisionChange> {
  return {
    id,
    issue: await createDownstreamIssue(db, github, productSlug, id),
  }
}

export async function addDecision(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  fields: ConceptFields,
  body: string,
): Promise<DecisionChange> {
  const id = await addConceptRecord(db, productSlug, 'decisions', fields, body)
  return openDownstream(db, github, productSlug, id)
}

export async function updateDecision(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  id: string,
  status: schema.DecisionStatus,
  supersededByRecordId?: string,
): Promise<DecisionChange> {
  await setDecisionStatus(db, productSlug, id, status, supersededByRecordId)
  return openDownstream(db, github, productSlug, id)
}

// null removes it: the Product's Goals are not measured.
export async function setAnalyticsProject(
  db: ConceptDb,
  productSlug: string,
  analyticsProject: string | null,
): Promise<void> {
  const updated = await db
    .update(schema.projects)
    .set({ analyticsProject })
    .where(eq(schema.projects.slug, productSlug))
    .returning({ id: schema.projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

// null removes it: Glue stops reading the Product's comments. A new handle is
// read from its first comment; the same handle keeps its read position.
export async function setSocialHandle(
  db: ConceptDb,
  productSlug: string,
  socialHandle: string | null,
): Promise<void> {
  const { projects } = schema
  const updated = await db
    .update(projects)
    .set({
      socialHandle,
      commentsReadUntil: sql`case when ${projects.socialHandle} is not distinct from ${socialHandle}::text then ${projects.commentsReadUntil} end`,
    })
    .where(eq(projects.slug, productSlug))
    .returning({ id: projects.id })
  if (updated.length === 0) throw new ProductNotFoundError(productSlug)
}

export const goalChangeSchema = z.object({
  measure: goalMeasureSchema.nullable().optional().meta({
    description:
      'null stops measuring the Goal. A new measure clears the baseline and the latest value',
  }),
  status: z.enum(schema.goalStatuses).optional(),
})

export type GoalChange = z.infer<typeof goalChangeSchema>

// Sets the fields the change names. A null measure: Glue stops measuring
// the Goal. A new measure reads another metric, so it clears the baseline
// and the latest value.
export async function updateGoal(
  db: ConceptDb,
  productSlug: string,
  id: string,
  change: GoalChange,
): Promise<void> {
  const { measure, status } = goalChangeSchema.parse(change)
  if (measure === undefined && status === undefined) {
    throw new InvalidRecordError('send a measure, a status or both')
  }
  await updatePart(db, productSlug, requireType(id, ['goal']), {
    measure,
    status,
  })
}

export async function setDecisionStatus(
  db: ConceptDb,
  productSlug: string,
  id: string,
  status: schema.DecisionStatus,
  supersededByRecordId?: string,
): Promise<void> {
  if (!schema.decisionStatuses.includes(status)) {
    throw new InvalidRecordError(
      `status "${status}" must be one of ${schema.decisionStatuses.join(', ')}`,
    )
  }
  requireType(id, ['decision'])
  if (status !== 'superseded') {
    if (supersededByRecordId) {
      throw new InvalidRecordError(
        '"superseded_by" only applies to a superseded Decision',
      )
    }
    await updatePart(db, productSlug, id, { status })
    return
  }
  if (!supersededByRecordId) {
    throw new InvalidRecordError('a superseded Decision needs "superseded_by"')
  }
  await supersedeDecision(
    db,
    productSlug,
    id,
    requireType(supersededByRecordId, ['decision']),
  )
}

// Accepts a Decision that waits for it. Any other change of status goes
// through updateDecision. The update itself asks for the status
// "proposed", so only one of two requests at the same time accepts.
export async function acceptDecision(
  db: ConceptDb,
  github: GithubClient,
  productSlug: string,
  id: string,
): Promise<DecisionChange> {
  const accepted = await updatePart(
    db,
    productSlug,
    requireType(id, ['decision']),
    { status: 'accepted' },
    { status: 'proposed' },
  )
  if (!accepted) throw new InvalidRecordError(`"${id}" is not proposed`)

  return openDownstream(db, github, productSlug, id)
}

function toNotDraftError(id: string) {
  return new InvalidRecordError(`"${id}" is not a draft`)
}

// Triage of a draft Insight: it becomes a normal Insight.
export async function keepInsight(
  db: ConceptDb,
  productSlug: string,
  id: string,
): Promise<void> {
  const kept = await updatePart(
    db,
    productSlug,
    requireType(id, ['insight']),
    { status: null },
    { status: 'draft' },
  )
  if (!kept) throw toNotDraftError(id)
}

// Triage of a draft Insight: it goes away. Only a draft can be discarded,
// and only while no Decision cites it.
export async function discardInsight(
  db: ConceptDb,
  productSlug: string,
  id: string,
): Promise<void> {
  const expected = { status: 'draft' }
  requireType(id, ['insight'])
  if (await removePart(db, productSlug, id, expected)) return

  const insight = await findPart(db, productSlug, id)
  if (insight?.status !== 'draft') throw toNotDraftError(id)
  const cited = sortById(insight.neededBy.map((end) => end.part))
  throw new InvalidRecordError(
    `"${id}" is the evidence of ${cited.map((part) => part.id).join(', ')}`,
  )
}
