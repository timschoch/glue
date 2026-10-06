// What each handler of the HTTP API shares: the request, the token check,
// the JSON body and the error answer. The Part handlers own this module.
import { z } from 'zod'

import type { ConceptDb } from '../db/client.ts'
import {
  ConceptNotFoundError,
  InvalidRecordError,
  isUniqueViolation,
  JointNotFoundError,
  PartNotFoundError,
  ProductNotFoundError,
} from '../db/record-errors.ts'
import { canReference } from '../db/projects.ts'
import { findProductByToken } from '../db/tokens.ts'
import type { GithubClient } from '../github/client.ts'

export type ApiRequest = {
  db: ConceptDb
  request: Request
  params: {
    project: string
    recordId?: string
    concept?: string
    jointId?: string
    askId?: string
  }
}

// A request that can accept a Decision, and so open its downstream issue.
export type ChangeRequest = ApiRequest & { github: GithubClient }

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
    error instanceof ConceptNotFoundError
  ) {
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

const BEARER = /^Bearer (\S+)$/i

// A token opens the Concept of its own Project. It also reads a Project
// that its Project may reference (D45). Each other Project answers 404, so
// a token does not reveal which Projects exist.
async function validateToken({ db, request, params }: ApiRequest) {
  const token = request.headers.get('authorization')?.match(BEARER)?.[1]
  const project = token ? await findProductByToken(db, token) : undefined
  if (!project) {
    throw new ApiError(
      'unauthorized',
      'send a valid token as "Authorization: Bearer <token>"',
    )
  }
  if (project === params.project) return
  const reads =
    request.method === 'GET' &&
    (await canReference(db, project, params.project))
  if (!reads) {
    throw new ApiError('not-found', `project "${params.project}" not found`)
  }
}

export async function handleApiRequest(
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

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError('invalid-request', 'the body is not JSON')
  }
}
