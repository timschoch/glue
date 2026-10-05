// The Signal source for analytics: the survey answers with a low score in
// the analytics project of the Project. It reads mock analytics
// (mocks/analytics) with one query, over HTTP only.
import { z } from 'zod'

import type { SignalSource } from '../db/signals.ts'
import { createResponseError } from '../measure/response-error.ts'

const TIMEOUT_MS = 10_000

// The answer to the Single Ease Question: 1 very hard to 7 very easy.
const SURVEY_EVENT = 'survey sent'
const SCORE_PROPERTY = '$survey_response'
const HIGHEST_SCORE = 7
// A score that says the task was hard.
const LOW_SCORE = 3
// The property with the words of the answer.
const REMARK_PROPERTY = 'comment'

const WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

const lowValuesResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      timestamp: z.iso.datetime(),
      value: z.number(),
      properties: z.record(z.string(), z.unknown()),
    }),
  ),
})

// Without `url` or `readKey` Glue has no metric source: no Signals.
export function createAnalyticsSource(options: {
  url: string | undefined
  readKey: string | undefined
  now?: () => Date
  fetch?: typeof fetch
}): SignalSource {
  const { url, readKey, now = () => new Date(), fetch: send = fetch } = options
  return {
    name: 'analytics',
    listSignals: async ({ analyticsProject }) => {
      if (!url || !readKey || !analyticsProject) return []
      const to = now()
      const response = await send(new URL('/api/low-values', url), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${readKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          project: analyticsProject,
          event: SURVEY_EVENT,
          property: SCORE_PROPERTY,
          at_most: LOW_SCORE,
          from: new Date(to.getTime() - WINDOW_DAYS * MS_PER_DAY).toISOString(),
          to: to.toISOString(),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        throw await createResponseError('mock analytics', response)
      }
      const { results } = lowValuesResponseSchema.parse(await response.json())
      return results.map(({ id, timestamp, value, properties }) => {
        const remark = properties[REMARK_PROPERTY]
        return {
          url: new URL(`/events/${id}`, url).href,
          title: `Survey answer ${value} of ${HIGHEST_SCORE}`,
          text: typeof remark === 'string' ? remark : '',
          date: timestamp.slice(0, 'yyyy-mm-dd'.length),
        }
      })
    },
  }
}
