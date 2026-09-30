import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord } from '../db/concept-records.ts'
import * as schema from '../db/schema.ts'
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
          source: 'mock-analytics',
          project: product,
          steps: ['signed-up', 'paid'],
          target: 0.25,
          window_days: 7,
        },
      },
      '',
    )
  }
})

afterEach(async () => {
  await client.close()
})

function callCron(authorization?: string) {
  const headers = new Headers()
  if (authorization) headers.set('authorization', authorization)
  return handleMeasureCron({
    db,
    request: new Request('http://localhost/api/cron/measure', { headers }),
    source,
    cronSecret: CRON_SECRET,
  })
}

describe('GET /api/cron/measure', () => {
  it('answers 401 without the cron secret', async () => {
    expect((await callCron()).status).toBe(401)
  })

  it('answers 401 with a wrong secret', async () => {
    expect((await callCron('Bearer wrong')).status).toBe(401)
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
