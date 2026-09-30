import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord, setAnalyticsProject } from '../db/concept-records.ts'
import * as schema from '../db/schema.ts'
import { measureGoals } from '../measure/measure-goals.ts'
import type { MetricSource } from '../measure/metric-source.ts'
import { handleMeasureCron } from './cron-api.ts'

const CRON_SECRET = 'cron-secret-for-tests'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

// Every funnel converts 10% from the first to the last step.
const source: MetricSource = {
  fetchFunnel: ({ steps }) =>
    Promise.resolve([
      {
        breakdown: null,
        steps: steps.map((event, index) => ({
          event,
          count: index === 0 ? 100 : 10,
        })),
      },
    ]),
  fetchMean: () => Promise.resolve([]),
}

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  for (const product of ['flexibeck', 'glue']) {
    await addConceptRecord(
      db,
      product,
      'goals',
      {
        title: 'More users pay',
        metric: 'signup to paid',
        source: 'okr',
        measure: {
          kind: 'funnel',
          source: 'mock-analytics',
          steps: ['signed-up', 'paid'],
          target: 0.25,
          window_days: 7,
        },
      },
      '',
    )
    await setAnalyticsProject(db, product, `phc_${product}`)
  }
})

afterEach(async () => {
  await client.close()
})

let measureCalls = 0

function callCron(
  authorization?: string,
  cronSecret: string | undefined = CRON_SECRET,
) {
  const headers = new Headers()
  if (authorization) headers.set('authorization', authorization)
  return handleMeasureCron({
    request: new Request('http://localhost/api/cron/measure', { headers }),
    cronSecret,
    measure: () => {
      measureCalls += 1
      return measureGoals({ db, source, now: new Date() })
    },
  })
}

describe('GET /api/cron/measure', () => {
  it('answers 401 without the cron secret', async () => {
    expect((await callCron()).status).toBe(401)
  })

  it('answers 401 with a wrong secret', async () => {
    expect((await callCron('Bearer wrong')).status).toBe(401)
  })

  it('answers 401 and measures nothing when CRON_SECRET is not set', async () => {
    measureCalls = 0

    expect((await callCron('Bearer ', '')).status).toBe(401)
    expect((await callCron('Bearer undefined', undefined)).status).toBe(401)
    expect(measureCalls).toBe(0)
  })

  it('measures the Goals of every Product', async () => {
    const response = await callCron(`Bearer ${CRON_SECRET}`)

    expect(response.status).toBe(200)
    const { insights } = await response.json()
    expect(
      insights.map(
        (insight: { product: string; id: string }) =>
          `${insight.product} ${insight.id}`,
      ),
    ).toEqual(['flexibeck I1', 'glue I1'])
  })
})
