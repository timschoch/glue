// The Integrations of a Project in the HTTP API (glue/D70). No answer holds
// a key (glue/D71). The schemas here document the answers in openapi.ts.
import { z } from 'zod'

import {
  integrationKeySchema,
  integrationSchema,
  integrationStates,
} from '../db/integrations.ts'
import type {
  AddedIntegration,
  IntegrationOperations,
} from '../db/integrations.ts'
import { IntegrationNotFoundError } from '../db/record-errors.ts'
import type { TokenMember } from '../db/tokens.ts'
import { ApiError, handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

// A request with the Integrations of the server: its tools and its secret.
export type IntegrationRequest = ApiRequest & {
  integrations: IntegrationOperations
}

export const savedIntegrationSchema = z
  .object({
    id: z.number(),
    tool: z.string(),
    address: z.string(),
    keyLastFour: z.string().meta({
      description:
        'The last four characters of the key, or of the secret that Glue made. Glue gives no more of it back',
    }),
    state: z.enum(integrationStates).meta({
      description:
        'active: Glue reads the Signals of the tool. paused: a member stopped the reads. failed: three reads in a row failed, and Glue reads no more until a member starts it again',
    }),
    lastRead: z
      .object({
        at: z.string().meta({ description: 'The time of the read' }),
        signalCount: z.number().nullable(),
        error: z
          .string()
          .nullable()
          .meta({ description: 'Why the read failed' }),
      })
      .nullable(),
    secret: z.string().optional().meta({
      description:
        'The secret that Glue made for a tool that posts to Glue. Only the answer to the add holds it, one time',
    }),
  })
  .meta({ id: 'Integration' }) satisfies z.ZodType<AddedIntegration>

export const integrationInputSchema = integrationSchema.meta({
  id: 'IntegrationInput',
})

export const integrationChangeSchema = z
  .union([
    z.strictObject({
      state: z.enum(['active', 'paused']).meta({
        description:
          'paused: Glue reads the tool no more. active: Glue reads the tool one time, and only a read that works starts the Integration again',
      }),
    }),
    z.strictObject({
      key: integrationKeySchema.meta({
        description:
          'A new key. Glue reads the tool one time with it, and only a read that works saves it in the place of the old key',
      }),
    }),
  ])
  .meta({ id: 'IntegrationChange' })

const INTEGRATION_ID = /^\d+$/

// An id that is no number names no Integration.
function parseIntegrationId({ integrationId = '' }: ApiRequest['params']) {
  if (!INTEGRATION_ID.test(integrationId))
    throw new IntegrationNotFoundError(integrationId)
  return Number(integrationId)
}

// Only a member changes the Integrations of the Project.
function validateMember(
  member: TokenMember | undefined,
): asserts member is TokenMember {
  if (!member)
    throw new ApiError(
      'unauthorized',
      'only the token of a member changes an Integration',
    )
}

// Only a token of the Project reads its Integrations: a Project that may
// reference this one does not see the tools of this team.
export function handleListIntegrations(input: IntegrationRequest) {
  return handleApiRequest(
    input,
    async () =>
      Response.json(await input.integrations.list(input.params.project)),
    { ownOnly: true },
  )
}

export function handleAddIntegration(input: IntegrationRequest) {
  return handleApiRequest(input, async (member) => {
    validateMember(member)
    const { integrations, request, params } = input
    const integration = integrationInputSchema.parse(await parseJson(request))
    return Response.json(
      await integrations.add(params.project, integration, member.email),
      { status: 201 },
    )
  })
}

export function handleChangeIntegration(input: IntegrationRequest) {
  return handleApiRequest(input, async (member) => {
    validateMember(member)
    const { integrations, request, params } = input
    const id = parseIntegrationId(params)
    const change = integrationChangeSchema.parse(await parseJson(request))
    if ('key' in change)
      return Response.json(
        await integrations.setKey(params.project, id, change.key),
      )
    return Response.json(
      change.state === 'paused'
        ? await integrations.pause(params.project, id)
        : await integrations.start(params.project, id),
    )
  })
}

export function handleRemoveIntegration(input: IntegrationRequest) {
  return handleApiRequest(input, async (member) => {
    validateMember(member)
    const { integrations, params } = input
    await integrations.remove(params.project, parseIntegrationId(params))
    return new Response(null, { status: 204 })
  })
}
