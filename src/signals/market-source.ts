// The Signal source for market analysis: the findings of the market
// analysis of the Project. It reads mock market (mocks/market), over HTTP
// only.
import { z } from 'zod'

import type { SignalSource } from '../db/signals.ts'
import { createResponseError } from '../measure/response-error.ts'

const TIMEOUT_MS = 10_000

const findingsResponseSchema = z.object({
  findings: z.array(
    z.object({
      url: z.url(),
      title: z.string(),
      summary: z.string(),
      published_at: z.iso.datetime(),
    }),
  ),
})

export function createMarketSource(
  options: { fetch?: typeof fetch } = {},
): SignalSource {
  const { fetch: send = fetch } = options
  return {
    name: 'market',
    listSignals: async ({ marketUrl }) => {
      if (!marketUrl) return []
      const response = await send(new URL('/api/findings', marketUrl), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) throw await createResponseError('Market', response)
      const { findings } = findingsResponseSchema.parse(await response.json())
      return findings.map((finding) => ({
        url: finding.url,
        title: finding.title,
        text: finding.summary,
        date: finding.published_at.slice(0, 'yyyy-mm-dd'.length),
      }))
    },
  }
}
