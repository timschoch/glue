// What each handler of the HTTP API shares: the request, the token check,
// the JSON body and the error answer. The Part handlers own this module.
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import {
  ConceptNotFoundError,
  IntegrationNotFoundError,
  InvalidRecordError,
  isUniqueViolation,
  JointNotFoundError,
  PartNotFoundError,
  ProductNotFoundError,
  SignalFilterNotFoundError,
  WebhookSecretError,
} from '../db/record-errors.ts'
import { canReference } from '../db/projects.ts'
import { findToken } from '../db/tokens.ts'
import type { TokenMember } from '../db/tokens.ts'
import type { GithubClient } from '../github/client.ts'

export type ApiRequest = {
  db: ConceptDb
  request: Request
  params: {
    project: string
    recordId?: string
    concept?: string
    kind?: string
    jointId?: string
    askId?: string
    questionId?: string
    filterId?: string
    integrationId?: string
  }
}

// A request that needs GitHub: it can accept a Decision, and so open its
// downstream issue, or it reads from the repository of the Project.
export type ChangeRequest = ApiRequest & { github: GithubClient }

const errorCodes = [
  'invalid-request',
  'unauthorized',
  'not-found',
  'conflict',
  'too-large',
] as const

type ErrorCode = (typeof errorCodes)[number]

const ERROR_STATUSES: Record<ErrorCode, number> = {
  'invalid-request': 400,
  unauthorized: 401,
  'not-found': 404,
  conflict: 409,
  'too-large': 413,
}

export const errorSchema = z
  .object({
    error: z.object({ code: z.enum(errorCodes), message: z.string() }),
  })
  .meta({ id: 'Error' })

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

// Any other error is a bug: it goes on to the server as a 500.
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof z.ZodError) {
    return new ApiError('invalid-request', z.prettifyError(error))
  }
  if (error instanceof PartNotFoundError) {
    return new ApiError('not-found', `part "${error.recordId}" not found`)
  }
  if (
    error instanceof ProductNotFoundError ||
    error instanceof JointNotFoundError ||
    error instanceof ConceptNotFoundError ||
    error instanceof SignalFilterNotFoundError ||
    error instanceof IntegrationNotFoundError
  ) {
    return new ApiError('not-found', error.message)
  }
  if (error instanceof InvalidRecordError) {
    return new ApiError('invalid-request', error.message)
  }
  if (error instanceof WebhookSecretError) {
    return new ApiError('unauthorized', error.message)
  }
  if (isUniqueViolation(error)) {
    return new ApiError(
      'conflict',
      'another request took the same id, try again',
    )
  }
  throw error
}

export function toErrorResponse(error: unknown): Response {
  const { code, message } = toApiError(error)
  return Response.json(
    { error: { code, message } },
    { status: ERROR_STATUSES[code] },
  )
}

const BEARER = /^Bearer (\S+)$/i

// The secret that the request sends as its bearer: a token, or the secret
// of a webhook.
export function findBearer(request: Request): string | undefined {
  return request.headers.get('authorization')?.match(BEARER)?.[1]
}

// A token opens the Concept of its own Project. It also reads a Project
// that its Project may reference (D45). Each other Project answers 404, so
// a token does not reveal which Projects exist. Gives back the member that
// the token belongs to (glue/D67), or undefined for a token of no member.
// `ownOnly`: the read is for the own Project of the token alone.
async function validateToken(
  { db, request, params }: ApiRequest,
  ownOnly: boolean,
): Promise<TokenMember | undefined> {
  const token = findBearer(request)
  const found = token ? await findToken(db, token) : undefined
  if (!found) {
    throw new ApiError(
      'unauthorized',
      'send a valid token as "Authorization: Bearer <token>"',
    )
  }
  const member = found.member ?? undefined
  if (found.project === params.project) return member
  const reads =
    !ownOnly &&
    request.method === 'GET' &&
    (await canReference(db, found.project, params.project))
  if (!reads) {
    throw new ApiError('not-found', `project "${params.project}" not found`)
  }
  return member
}

// `respond` gets the member that the token belongs to. A write is a write
// of this member: the handler hands the e-mail address to the operation.
// `ownOnly`: a token of a Project that references this one reads nothing
// here.
export async function handleApiRequest(
  input: ApiRequest,
  respond: (member?: TokenMember) => Promise<Response>,
  { ownOnly = false }: { ownOnly?: boolean } = {},
): Promise<Response> {
  try {
    return await respond(await validateToken(input, ownOnly))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError('invalid-request', 'the body is not JSON')
  }
}
