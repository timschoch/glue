// The Signal source for the social channel: the Comments under the social
// handle of the Project. It reads mock social (mocks/social) with one
// query, over HTTP only. A Comment stays in the channel.
import { z } from 'zod'

import type { SignalSource } from '../db/signals.ts'
import { createResponseError } from '../measure/response-error.ts'

const TIMEOUT_MS = 10_000

const WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

const commentsResponseSchema = z.object({
  comments: z.array(
    z.object({
      id: z.string(),
      author: z.string(),
      text: z.string(),
      created_at: z.iso.datetime(),
    }),
  ),
})

// A Project with a social handle needs the social channel: without `url` or
// `readKey` the source fails, so the Signals page shows it.
export function createSocialSource(options: {
  url: string | undefined
  readKey: string | undefined
  now?: () => Date
  fetch?: typeof fetch
}): SignalSource {
  const { url, readKey, now = () => new Date(), fetch: send = fetch } = options
  return {
    name: 'social',
    listSignals: async ({ socialHandle }) => {
      if (!socialHandle) return []
      if (!url || !readKey) {
        throw new Error('Social has no address or no read key')
      }
      const until = now()
      const endpoint = new URL('/api/comments', url)
      endpoint.searchParams.set('handle', socialHandle)
      endpoint.searchParams.set(
        'since',
        new Date(until.getTime() - WINDOW_DAYS * MS_PER_DAY).toISOString(),
      )
      endpoint.searchParams.set('until', until.toISOString())
      // A busy channel has more Comments than one read gives: the list
      // shows the newest ones.
      endpoint.searchParams.set('order', 'newest')
      const response = await send(endpoint, {
        headers: { authorization: `Bearer ${readKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) throw await createResponseError('Social', response)
      const { comments } = commentsResponseSchema.parse(await response.json())
      return comments.map(({ id, author, text, created_at }) => ({
        // The page of the Comment for a person, not its address in the API.
        url: new URL(`/comments/${id}`, url).href,
        title: `Comment of ${author}`,
        titleBy: 'glue' as const,
        text,
        date: created_at.slice(0, 'yyyy-mm-dd'.length),
      }))
    },
  }
}
