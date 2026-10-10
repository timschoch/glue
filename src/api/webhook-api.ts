// The webhook of a Project in the HTTP API (glue/D72): the one path that a
// tool of the team posts its Signals to. The secret of a webhook opens it,
// not a token.
import { z } from 'zod'

import { WebhookSecretError } from '../db/record-errors.ts'
import { webhookPostSchema } from '../db/webhook-signals.ts'
import { ApiError, findBearer, toErrorResponse } from './api-request.ts'
import type { IntegrationRequest } from './integration-api.ts'

// The most bytes of one post.
const MAX_POST_BYTES = 100_000

export const webhookPostInputSchema = webhookPostSchema.meta({
  id: 'WebhookPost',
})

export const webhookAnswerSchema = z
  .object({
    stored: z.number().meta({
      description:
        'The count of the new Signals. A Signal with a link that the webhook has already is not new',
    }),
  })
  .meta({ id: 'WebhookAnswer' })

// The body of the post as JSON. A post that says its size is refused
// before the server reads it. A post that says none is read in parts, and
// the read stops at the first part over the limit.
async function parsePost(request: Request) {
  const tooLarge = new ApiError(
    'too-large',
    `a post has at most ${MAX_POST_BYTES} bytes`,
  )
  if (Number(request.headers.get('content-length')) > MAX_POST_BYTES)
    throw tooLarge
  const reader = request.body?.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_POST_BYTES) {
      await reader.cancel()
      throw tooLarge
    }
    parts.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString()) as unknown
  } catch {
    throw new ApiError('invalid-request', 'the body is not JSON')
  }
}

export async function handlePostWebhook({
  integrations,
  request,
  params,
}: IntegrationRequest): Promise<Response> {
  try {
    const secret = findBearer(request)
    if (!secret) throw new WebhookSecretError()
    return Response.json(
      await integrations.addWebhookSignals(params.project, secret, () =>
        parsePost(request),
      ),
      { status: 201 },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
