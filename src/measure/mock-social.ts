// The social channel client for mock social (mocks/social), over HTTP only:
// Glue never imports the Mock's code.
import { z } from 'zod'

import { createResponseError } from './response-error.ts'
import type { SocialChannel } from './social-channel.ts'

const TIMEOUT_MS = 10_000

const commentsResponseSchema = z.object({
  comments: z.array(
    z.object({
      author: z.string(),
      text: z.string(),
      created_at: z.iso.datetime(),
    }),
  ),
})

export function createMockSocialChannel(options: {
  url: string
  readKey: string
  fetch?: typeof fetch
}): SocialChannel {
  const { url, readKey, fetch: send = fetch } = options
  return {
    fetchComments: async ({ handle, since, until }) => {
      const endpoint = new URL('/api/comments', url)
      endpoint.searchParams.set('handle', handle)
      if (since) endpoint.searchParams.set('since', since.toISOString())
      endpoint.searchParams.set('until', until.toISOString())
      const response = await send(endpoint, {
        headers: { authorization: `Bearer ${readKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        throw await createResponseError('mock social', response)
      }
      const { comments } = commentsResponseSchema.parse(await response.json())
      return comments.map((comment) => ({
        author: comment.author,
        text: comment.text,
        createdAt: new Date(comment.created_at),
      }))
    },
  }
}
