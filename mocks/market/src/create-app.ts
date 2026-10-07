import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { html } from 'hono/html'

import { seededFindings } from './findings.ts'
import type { Finding } from './findings.ts'

// The market analysis holds its findings in memory: the seed, or the
// findings of a test. Nobody writes to it.
export function createApp(
  options: { findings?: ReadonlyArray<Finding> } = {},
): Hono {
  const { findings = seededFindings } = options
  const app = new Hono({ strict: false })

  // All findings, each with the address of its page for a person.
  app.get('/api/findings', cors(), (context) => {
    const { origin } = new URL(context.req.url)
    return context.json({
      findings: findings.map(({ id, ...finding }) => ({
        id,
        url: `${origin}/findings/${id}`,
        ...finding,
      })),
    })
  })

  app.get('/findings/:id', (context) => {
    const id = Number(context.req.param('id'))
    const finding = findings.find((listed) => listed.id === id)
    if (!finding) return context.notFound()
    return context.html(
      html`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>${finding.title}</title>
          </head>
          <body>
            <h1>${finding.title}</h1>
            <p>${finding.summary}</p>
            <p>${finding.published_at}</p>
          </body>
        </html>`,
    )
  })

  return app
}
