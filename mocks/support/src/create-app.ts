import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { html } from 'hono/html'

import { seededTickets } from './tickets.ts'
import type { Ticket } from './tickets.ts'

// The help desk holds its tickets in memory: the seed, or the tickets of a
// test. Nobody writes to it.
export function createApp(
  options: { tickets?: ReadonlyArray<Ticket> } = {},
): Hono {
  const { tickets = seededTickets } = options
  const app = new Hono({ strict: false })

  // The list call of the help desk, like Zendesk's `GET /api/v2/tickets.json`.
  // All tickets fit on one page.
  app.get('/api/v2/tickets.json', cors(), (context) => {
    const { origin } = new URL(context.req.url)
    return context.json({
      tickets: tickets.map(({ id, ...ticket }) => ({
        id,
        url: `${origin}/api/v2/tickets/${id}.json`,
        ...ticket,
      })),
      next_page: null,
      previous_page: null,
      count: tickets.length,
    })
  })

  // The page of one ticket, at the path of the help desk's agent view.
  app.get('/agent/tickets/:id', (context) => {
    const id = Number(context.req.param('id'))
    const ticket = tickets.find((listed) => listed.id === id)
    if (!ticket) return context.notFound()
    return context.html(
      html`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>#${ticket.id} ${ticket.subject}</title>
          </head>
          <body>
            <h1>${ticket.subject}</h1>
            <p>${ticket.description}</p>
            <p>${ticket.status}, ${ticket.created_at}</p>
          </body>
        </html>`,
    )
  })

  return app
}
