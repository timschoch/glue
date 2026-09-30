import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { cors } from 'hono/cors'

import { parsePayload, toEventRows } from './capture.ts'
import { toFunnelResults } from './funnel.ts'
import type { FunnelQuery } from './funnel.ts'
import { events } from './schema.ts'
import type { AnalyticsDatabase } from './schema.ts'

// The paths posthog-js and posthog-node post events to. With `strict: false`
// each matches with and without the trailing slash the clients send.
const capturePaths = ['/e', '/i/v0/e', '/batch', '/capture']

// PostHog's default funnel window: 14 days.
const DEFAULT_WINDOW_HOURS = 336

export function createApp(options: {
  database: AnalyticsDatabase
  readKey: string
}) {
  const { database, readKey } = options
  const app = new Hono({ strict: false })

  app.use(cors())

  for (const path of capturePaths) {
    app.post(path, async (context) => {
      const payload = await parsePayload(context.req.raw).catch(() => null)
      const rows = toEventRows(payload, new Date())
      if (!rows) return context.json({ error: 'invalid event payload' }, 400)
      if (rows.length > 0) await database.insert(events).values(rows)
      return context.json({ status: 1 })
    })
  }

  // No feature flags: posthog-js only needs a well-formed answer.
  app.all('/decide', (context) => context.json(emptyFlags))
  app.all('/flags', (context) => context.json(emptyFlags))

  app.use('/api/*', bearerAuth({ token: readKey }))

  app.post('/api/funnel', async (context) => {
    const query = parseFunnelQuery(await context.req.json().catch(() => null))
    if (typeof query === 'string') return context.json({ error: query }, 400)

    const rows = await database
      .select()
      .from(events)
      .where(
        and(
          eq(events.project, query.project),
          inArray(events.name, query.steps),
          gte(events.timestamp, query.from),
          lt(events.timestamp, query.to),
        ),
      )
    return context.json({ results: toFunnelResults(rows, query) })
  })

  app.get('/api/events', async (context) => {
    const { project, event } = context.req.query()
    const from = parseDate(context.req.query('from'))
    const to = parseDate(context.req.query('to'))
    if (!project || !event || !from || !to) {
      return context.json(
        { error: 'project, event, from and to are required, dates in ISO' },
        400,
      )
    }

    const date = sql<string>`to_char(${events.timestamp} at time zone 'UTC', 'YYYY-MM-DD')`
    const days = await database
      .select({ date, count: sql<number>`count(*)::int` })
      .from(events)
      .where(
        and(
          eq(events.project, project),
          eq(events.name, event),
          gte(events.timestamp, from),
          lt(events.timestamp, to),
        ),
      )
      .groupBy(date)
      .orderBy(date)
    return context.json({ days })
  })

  return app
}

const emptyFlags = {
  featureFlags: {},
  featureFlagPayloads: {},
  flags: {},
  errorsWhileComputingFlags: false,
  sessionRecording: false,
  supportedCompression: ['gzip-js', 'base64'],
}

// Returns the query, or the reason it is invalid.
function parseFunnelQuery(body: unknown): FunnelQuery | string {
  if (typeof body !== 'object' || body === null) return 'body must be JSON'
  const {
    project,
    steps,
    from,
    to,
    breakdown,
    window_hours: windowHours = DEFAULT_WINDOW_HOURS,
  } = body as Record<string, unknown>
  if (typeof project !== 'string') return 'project must be a string'
  if (
    !Array.isArray(steps) ||
    steps.length === 0 ||
    !steps.every((step) => typeof step === 'string')
  ) {
    return 'steps must be a non-empty array of event names'
  }
  const fromDate = parseDate(from)
  const toDate = parseDate(to)
  if (!fromDate || !toDate) return 'from and to must be ISO dates'
  if (breakdown !== undefined && typeof breakdown !== 'string') {
    return 'breakdown must be a property name'
  }
  if (typeof windowHours !== 'number' || !(windowHours > 0)) {
    return 'window_hours must be a positive number'
  }
  return { project, steps, from: fromDate, to: toDate, breakdown, windowHours }
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
