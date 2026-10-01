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

const meanResponseSchema = z.object({
  results: z.array(
    z.object({
      breakdown: z.string().nullable(),
      count: z.number(),
      mean: z.number().nullable(),
      lastSeenAt: z.iso
        .datetime()
        .transform((time) => new Date(time))
        .nullable(),
    }),
  ),
})

export function createMockAnalyticsSource(options: {
  url: string
  readKey: string
  fetch?: typeof fetch
}): MetricSource {
  const { url, readKey, fetch: send = fetch } = options

  async function fetchQuery(
    path: string,
    { from, to, ...query }: { from: Date; to: Date },
  ): Promise<unknown> {
    const response = await send(new URL(path, url), {
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
    return response.json()
  }

  return {
    fetchFunnel: async (query) =>
      funnelResponseSchema.parse(await fetchQuery('/api/funnel', query))
        .results,
    fetchMean: async (query) =>
      meanResponseSchema.parse(await fetchQuery('/api/mean', query)).results,
  }
}
