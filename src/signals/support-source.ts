// The Signal source for support tickets: the tickets of the help desk of
// the Project. It reads the list call of Zendesk, which mock support
// (mocks/support) speaks, over HTTP only.
import { z } from 'zod'

import type { SignalSource } from '../db/signals.ts'
import { createResponseError } from '../measure/response-error.ts'

const TIMEOUT_MS = 10_000

const ticketsResponseSchema = z.object({
  tickets: z.array(
    z.object({
      id: z.number(),
      subject: z.string(),
      description: z.string(),
      created_at: z.iso.datetime(),
    }),
  ),
})

export function createSupportSource(
  options: { fetch?: typeof fetch } = {},
): SignalSource {
  const { fetch: send = fetch } = options
  return {
    name: 'support',
    listSignals: async ({ supportUrl }) => {
      if (!supportUrl) return []
      const response = await send(new URL('/api/v2/tickets.json', supportUrl), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) throw await createResponseError('Support', response)
      const { tickets } = ticketsResponseSchema.parse(await response.json())
      return tickets.map((ticket) => ({
        // The page of the ticket for a person, not its address in the API.
        url: new URL(`/agent/tickets/${ticket.id}`, supportUrl).href,
        title: ticket.subject,
        text: ticket.description,
        date: ticket.created_at.slice(0, 'yyyy-mm-dd'.length),
      }))
    },
  }
}
