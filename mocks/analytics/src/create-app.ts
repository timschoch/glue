import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'

import { PayloadTooLargeError, parsePayload, toEventRows } from './capture.ts'
import { toFunnelResults } from './funnel.ts'
import type { FunnelQuery } from './funnel.ts'
import { toMeanResults } from './mean.ts'
import type { MeanQuery, PropertyFilter } from './mean.ts'
import { events } from './schema.ts'
import type { AnalyticsDatabase } from './schema.ts'

// The paths posthog-js and posthog-node post events to. With `strict: false`
// each matches with and without the trailing slash the clients send.
const capturePaths = ['/e', '/i/v0/e', '/batch', '/capture']

// Largest capture body on the wire. MAX_PAYLOAD_BYTES caps it after gzip.
const MAX_BODY_BYTES = 5 * 1024 * 1024

// Rows per insert. Postgres takes at most 65535 bind parameters per query.
const INSERT_CHUNK_ROWS = 1000

// PostHog's default funnel window: 14 days.
const DEFAULT_WINDOW_HOURS = 336

export function createApp(options: {
  database: AnalyticsDatabase
  readKey: string
}) {
  const { database, readKey } = options
  const app = new Hono({ strict: false })

  app.use(cors())

  const tooLarge = { error: 'payload too large' }
  for (const path of capturePaths) {
    app.post(
      path,
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (context) => context.json(tooLarge, 413),
      }),
      async (context) => {
        let payload: unknown
        try {
          payload = await parsePayload(context.req.raw)
        } catch (error) {
          if (error instanceof PayloadTooLargeError) {
            return context.json(tooLarge, 413)
          }
          return context.json({ error: 'invalid event payload' }, 400)
        }
        const rows = toEventRows(payload, new Date())
        if (!rows) return context.json({ error: 'invalid event payload' }, 400)
        for (let start = 0; start < rows.length; start += INSERT_CHUNK_ROWS) {
          await database
            .insert(events)
            .values(rows.slice(start, start + INSERT_CHUNK_ROWS))
        }
        return context.json({ status: 1 })
      },
    )
  }

  // No feature flags: posthog-js only needs a well-formed answer.
  app.all('/decide', (context) => context.json(emptyFlags))
  app.all('/flags', (context) => context.json(emptyFlags))
  // No remote config either. posthog-js fetches both forms.
  app.get('/array/:token/config', (context) => context.json({}))
  app.get('/array/:token/config.js', (context) =>
    context.body('{}', 200, { 'Content-Type': 'text/javascript' }),
  )

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

  app.post('/api/mean', async (context) => {
    const query = parseMeanQuery(await context.req.json().catch(() => null))
    if (typeof query === 'string') return context.json({ error: query }, 400)

    const rows = await database
      .select({ properties: events.properties })
      .from(events)
      .where(
        and(
          eq(events.project, query.project),
          eq(events.name, query.event),
          gte(events.timestamp, query.from),
          lt(events.timestamp, query.to),
        ),
      )
    return context.json({ results: toMeanResults(rows, query) })
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

// Returns the query, or the reason it is invalid.
function parseMeanQuery(body: unknown): MeanQuery | string {
  if (typeof body !== 'object' || body === null) return 'body must be JSON'
  const { project, event, property, from, to, where, breakdown } =
    body as Record<string, unknown>
  if (typeof project !== 'string') return 'project must be a string'
  if (typeof event !== 'string') return 'event must be an event name'
  if (typeof property !== 'string') return 'property must be a property name'
  const fromDate = parseDate(from)
  const toDate = parseDate(to)
  if (!fromDate || !toDate) return 'from and to must be ISO dates'
  if (where !== undefined && !isPropertyFilter(where)) {
    return 'where must be { property, value } with a string, number or boolean value'
  }
  if (breakdown !== undefined && typeof breakdown !== 'string') {
    return 'breakdown must be a property name'
  }
  return {
    project,
    event,
    property,
    from: fromDate,
    to: toDate,
    where,
    breakdown,
  }
}

function isPropertyFilter(value: unknown): value is PropertyFilter {
  if (typeof value !== 'object' || value === null) return false
  const { property, value: filterValue } = value as Record<string, unknown>
  return (
    typeof property === 'string' &&
    ['string', 'number', 'boolean'].includes(typeof filterValue)
  )
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
