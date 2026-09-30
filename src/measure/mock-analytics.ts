// The metric source client for mock analytics (mocks/analytics), over HTTP
// only: Glue never imports the Mock's code.
import { z } from 'zod'

import type { MetricSource } from './metric-source.ts'

const funnelResponseSchema = z.object({
  results: z.array(
    z.object({
      breakdown: z.string().nullable(),
      steps: z.array(z.object({ event: z.string(), count: z.number() })),
    }),
  ),
})

export function createMockAnalyticsSource(options: {
  url: string
  readKey: string
  fetch?: typeof fetch
}): MetricSource {
  const { url, readKey, fetch: send = fetch } = options
  return {
    fetchFunnel: async ({ from, to, ...query }) => {
      const response = await send(new URL('/api/funnel', url), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${readKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...query,
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      })
      if (!response.ok) {
        throw new Error(
          `mock analytics answered ${response.status}: ${await response.text()}`,
        )
      }
      return funnelResponseSchema.parse(await response.json()).results
    },
  }
}
