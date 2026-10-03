// The Concept HTTP API. The server routes in src/routes/api/ reach these
// handlers through concept-routes.ts. The schemas here validate requests and
// document them in openapi.ts.
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import {
  decisionSchema,
  findConcept,
  findRecord,
  insightSchema,
} from '../db/concept.ts'
import type { LinkedRecord } from '../db/concept.ts'
import { CONCEPT_FIELDS } from '../db/concept-fields.ts'
import {
  addConceptRecord,
  addDecision,
  goalChangeSchema,
  InvalidRecordError,
  ProductNotFoundError,
  updateDecision,
  updateGoal,
} from '../db/concept-records.ts'
import type { DecisionChange } from '../db/concept-records.ts'
import { proposalSchema } from '../db/decision-proposal.ts'
import { goalMeasureSchema } from '../db/goal-measure.ts'
import { findProductByToken } from '../db/tokens.ts'
import type { GithubClient } from '../github/client.ts'
import {
  measureGoals,
  measuredInsightSchema,
  skippedGoalSchema,
} from '../measure/measure-goals.ts'
import type { MetricSource } from '../measure/metric-source.ts'

export type ApiRequest = {
  db: ConceptDb
  request: Request
  params: { project: string; folder?: string; recordId?: string }
}

// A request that can accept a Decision, and so open its downstream issue.
type ChangeRequest = ApiRequest & { github: GithubClient }

const text = z.string().min(1)
const body = z.string().default('')

export const goalInputSchema = z
  .object({
    title: text,
    metric: text,
    source: text,
    measure: goalMeasureSchema.optional(),
    body,
  })
  .meta({ id: 'GoalInput' })

export const goalUpdateSchema = goalChangeSchema.meta({
  id: 'GoalUpdate',
  description:
    'A measure, a status or both. A person or an agent closes a Goal with status achieved',
})

export const insightInputSchema = z
  .object({
    title: text,
    date: z.iso.date().optional(),
    source: text,
    status: insightSchema.shape.status.unwrap().optional(),
    body,
  })
  .meta({ id: 'InsightInput' })

export const factInputSchema = z
  .object({ title: text, source: text, body })
  .meta({ id: 'FactInput' })

// The fields that a person writes in the app come from the schema of the
// app, so the two entry points have one set of rules.
export const decisionInputSchema = z
  .object({
    title: proposalSchema.shape.title,
    date: z.iso.date().optional(),
    owner: proposalSchema.shape.owner,
    status: decisionSchema.shape.status,
    goal: proposalSchema.shape.goal,
    evidence: proposalSchema.shape.evidence,
    superseded_by: text.optional(),
    supersedes: proposalSchema.shape.supersedes,
    body: proposalSchema.shape.body,
  })
  .meta({ id: 'DecisionInput' })

export const decisionUpdateSchema = z
  .object({
    status: decisionSchema.shape.status,
    superseded_by: text.optional(),
  })
  .meta({ id: 'DecisionUpdate' })

// A Decision after an add or a status change. An accepted Decision opens
// its issue downstream. When GitHub fails, the change stays and
// `issueError` says why the issue is missing.
export const changedDecisionSchema = decisionSchema
  .extend({
    issueError: z.string().optional().meta({
      description:
        'Why the issue is missing. The next status change or `pnpm concept downstream` opens it',
    }),
  })
  .meta({ id: 'ChangedDecision' })

// The folders a client may add records to.
export const inputSchemas = {
  goals: goalInputSchema,
  insights: insightInputSchema,
  decisions: decisionInputSchema,
  facts: factInputSchema,
}

// The folders a client may change records in.
export const updateSchemas = {
  goals: goalUpdateSchema,
  decisions: decisionUpdateSchema,
}

export const measureResultSchema = z
  .object({
    insights: z.array(measuredInsightSchema),
    skipped: z.array(skippedGoalSchema),
  })
  .meta({ id: 'MeasureResult' })

const errorCodes = [
  'invalid-request',
  'unauthorized',
  'not-found',
  'conflict',
] as const

type ErrorCode = (typeof errorCodes)[number]

const ERROR_STATUSES: Record<ErrorCode, number> = {
  'invalid-request': 400,
  unauthorized: 401,
  'not-found': 404,
  conflict: 409,
}

export const errorSchema = z
  .object({
    error: z.object({ code: z.enum(errorCodes), message: z.string() }),
  })
  .meta({ id: 'Error' })

class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && error.cause ? error.cause : error
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === UNIQUE_VIOLATION
  )
}

// Any other error is a bug: it goes on to the server as a 500.
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof z.ZodError) {
    return new ApiError('invalid-request', z.prettifyError(error))
  }
  if (error instanceof ProductNotFoundError) {
    return new ApiError('not-found', error.message)
  }
  if (error instanceof InvalidRecordError) {
    return new ApiError('invalid-request', error.message)
  }
  if (isUniqueViolation(error)) {
    return new ApiError(
      'conflict',
      'another request took the same id, try again',
    )
  }
  throw error
}

function toErrorResponse(error: unknown): Response {
  const { code, message } = toApiError(error)
  return Response.json(
    { error: { code, message } },
    { status: ERROR_STATUSES[code] },
  )
}

function isKeyOf<TObject extends object>(
  object: TObject,
  key: string | undefined,
): key is Extract<keyof TObject, string> {
  return key !== undefined && Object.hasOwn(object, key)
}

const BEARER = /^Bearer (\S+)$/i

// A token opens the Concept of its own Project only. Another Project
// answers 404, so a token does not reveal which Projects exist.
async function validateToken({ db, request, params }: ApiRequest) {
  const token = request.headers.get('authorization')?.match(BEARER)?.[1]
  const project = token ? await findProductByToken(db, token) : undefined
  if (!project) {
    throw new ApiError(
      'unauthorized',
      'send a valid token as "Authorization: Bearer <token>"',
    )
  }
  if (project !== params.project) {
    throw new ApiError('not-found', `project "${params.project}" not found`)
  }
}

async function handleApiRequest(
  input: ApiRequest,
  respond: () => Promise<Response>,
): Promise<Response> {
  try {
    await validateToken(input)
    return await respond()
  } catch (error) {
    return toErrorResponse(error)
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError('invalid-request', 'the body is not JSON')
  }
}

function parseFolder(folder: string | undefined) {
  if (!isKeyOf(CONCEPT_FIELDS, folder)) {
    throw new ApiError('not-found', `folder "${folder}" not found`)
  }
  return folder
}

async function findFolderRecord({
  db,
  params,
}: ApiRequest): Promise<LinkedRecord> {
  const folder = parseFolder(params.folder)
  const recordId = params.recordId ?? ''
  const record = recordId.startsWith(CONCEPT_FIELDS[folder].prefix)
    ? await findRecord(db, params.project, recordId)
    : undefined
  if (!record) {
    throw new ApiError('not-found', `${folder} "${recordId}" not found`)
  }
  return record
}

async function findChangedDecision(
  { db, params }: ApiRequest,
  { id, issue }: DecisionChange,
) {
  const decision = await findRecord(db, params.project, id)
  return issue.kind === 'failed'
    ? { ...decision, issueError: issue.message }
    : decision
}

export function handleGetConcept(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await findConcept(input.db, input.params.project)),
  )
}

export function handleListRecords(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const folder = parseFolder(input.params.folder)
    const concept = await findConcept(input.db, input.params.project)
    return Response.json(concept?.[folder] ?? [])
  })
}

export function handleGetRecord(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await findFolderRecord(input)),
  )
}

export function handleAddRecord(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { db, github, request, params } = input
    const { project, folder } = params
    if (!isKeyOf(inputSchemas, folder)) {
      throw new ApiError('not-found', `cannot add ${folder} here`)
    }
    const { body: recordBody, ...fields } = inputSchemas[folder].parse(
      await parseJson(request),
    )
    const record =
      folder === 'decisions'
        ? await findChangedDecision(
            input,
            await addDecision(db, github, project, fields, recordBody),
          )
        : await findRecord(
            db,
            project,
            await addConceptRecord(db, project, folder, fields, recordBody),
          )
    return Response.json(record, { status: 201 })
  })
}

export function handleUpdateRecord(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { db, github, request, params } = input
    if (!isKeyOf(updateSchemas, params.folder)) {
      throw new ApiError('not-found', `cannot update ${params.folder} here`)
    }
    const record = await findFolderRecord(input)
    const json = await parseJson(request)
    if (params.folder === 'goals') {
      const change = goalUpdateSchema.parse(json)
      await updateGoal(db, params.project, record.id, change)
      return Response.json(await findRecord(db, params.project, record.id))
    }
    const update = decisionUpdateSchema.parse(json)
    const change = await updateDecision(
      db,
      github,
      params.project,
      record.id,
      update.status,
      update.superseded_by,
    )
    return Response.json(await findChangedDecision(input, change))
  })
}

// Measures the Goals of the Project now. Returns the Insights it wrote and
// the Goals it could not measure.
export function handleMeasureProject(
  input: ApiRequest & { source: MetricSource },
) {
  return handleApiRequest(input, async () => {
    const result = await measureGoals({
      db: input.db,
      source: input.source,
      now: new Date(),
      productSlug: input.params.project,
    })
    return Response.json(result)
  })
}
