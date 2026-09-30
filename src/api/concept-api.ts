// The Concept HTTP API. The server routes in src/routes/api/ call these
// handlers. The schemas here validate requests and document them in
// openapi.ts.
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import { findConcept, findRecord } from '../db/concept.ts'
import type { LinkedRecord } from '../db/concept.ts'
import { CONCEPT_FIELDS } from '../db/concept-fields.ts'
import {
  addConceptRecord,
  InvalidRecordError,
  setDecisionStatus,
} from '../db/concept-records.ts'
import { decisionStatuses, insightStatuses } from '../db/schema.ts'
import { findProductByToken } from '../db/tokens.ts'

export type ApiRequest = {
  db: ConceptDb
  request: Request
  params: { product: string; folder?: string; recordId?: string }
}

const text = z.string().min(1)
const body = z.string().default('')

export const insightInputSchema = z
  .object({
    title: text,
    date: z.iso.date().optional(),
    source: text,
    status: z.enum(insightStatuses).optional(),
    body,
  })
  .meta({ id: 'InsightInput' })

export const factInputSchema = z
  .object({ title: text, source: text, body })
  .meta({ id: 'FactInput' })

export const decisionInputSchema = z
  .object({
    title: text,
    date: z.iso.date().optional(),
    owner: text,
    status: z.enum(decisionStatuses),
    goal: text,
    evidence: z.array(text).min(1),
    superseded_by: text.optional(),
    body,
  })
  .meta({ id: 'DecisionInput' })

export const decisionUpdateSchema = z
  .object({
    status: z.enum(decisionStatuses),
    superseded_by: text.optional(),
  })
  .meta({ id: 'DecisionUpdate' })

// The folders a client may add records to.
export const inputSchemas = {
  insights: insightInputSchema,
  decisions: decisionInputSchema,
  facts: factInputSchema,
}

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

const BEARER = /^Bearer (\S+)$/

// A token opens the Concept of its own Product only. Another Product
// answers 404, so a token does not reveal which Products exist.
async function validateToken({ db, request, params }: ApiRequest) {
  const token = request.headers.get('authorization')?.match(BEARER)?.[1]
  const product = token ? await findProductByToken(db, token) : undefined
  if (!product) {
    throw new ApiError(
      'unauthorized',
      'send a valid token as "Authorization: Bearer <token>"',
    )
  }
  if (product !== params.product) {
    throw new ApiError('not-found', `product "${params.product}" not found`)
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
    ? await findRecord(db, params.product, recordId)
    : undefined
  if (!record) {
    throw new ApiError('not-found', `${folder} "${recordId}" not found`)
  }
  return record
}

export function handleGetConcept(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await findConcept(input.db, input.params.product)),
  )
}

export function handleListRecords(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const folder = parseFolder(input.params.folder)
    const concept = await findConcept(input.db, input.params.product)
    return Response.json(concept?.[folder] ?? [])
  })
}

export function handleGetRecord(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await findFolderRecord(input)),
  )
}

export function handleAddRecord(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    if (!isKeyOf(inputSchemas, params.folder)) {
      throw new ApiError('not-found', `cannot add ${params.folder} here`)
    }
    const { body: recordBody, ...fields } = inputSchemas[params.folder].parse(
      await parseJson(request),
    )
    const recordId = await addConceptRecord(
      db,
      params.product,
      params.folder,
      fields,
      recordBody,
    )
    return Response.json(await findRecord(db, params.product, recordId), {
      status: 201,
    })
  })
}

export function handleUpdateDecision(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    if (params.folder !== 'decisions') {
      throw new ApiError('not-found', `cannot update ${params.folder} here`)
    }
    const decision = await findFolderRecord(input)
    const update = decisionUpdateSchema.parse(await parseJson(request))
    await setDecisionStatus(
      db,
      params.product,
      decision.id,
      update.status,
      update.superseded_by,
    )
    return Response.json(await findRecord(db, params.product, decision.id))
  })
}
