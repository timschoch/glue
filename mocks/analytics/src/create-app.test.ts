import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { gzipSync } from 'node:zlib'
import { PostHog } from 'posthog-node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

const readKey = 'test-read-key'
const project = 'phc_demo'

let client: PGlite
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  client = new PGlite()
  const database = drizzle(client, { schema })
  await migrate(database, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  app = createApp({ database, readKey })
})

afterEach(async () => {
  await client.close()
})

function queryFunnel(body: object) {
  return app.request('/api/funnel', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('capture with posthog-node', () => {
  it('stores the events, and a funnel reads them back', async () => {
    const posthog = new PostHog(project, {
      host: 'http://mock.test',
      flushAt: 1,
      fetch: async (url, options) => app.request(url, options),
    })
    posthog.capture({
      distinctId: 'ada',
      event: 'signed_up',
      timestamp: new Date('2026-09-01T10:00:00Z'),
    })
    posthog.capture({
      distinctId: 'ada',
      event: 'created_concept',
      timestamp: new Date('2026-09-01T11:00:00Z'),
    })
    posthog.capture({
      distinctId: 'bob',
      event: 'signed_up',
      timestamp: new Date('2026-09-01T12:00:00Z'),
    })
    await posthog.shutdown()

    const response = await queryFunnel({
      project,
      steps: ['signed_up', 'created_concept'],
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-02T00:00:00Z',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      results: [
        {
          breakdown: null,
          steps: [
            {
              event: 'signed_up',
              count: 2,
              conversion_from_previous: 1,
              conversion_from_first: 1,
            },
            {
              event: 'created_concept',
              count: 1,
              conversion_from_previous: 0.5,
              conversion_from_first: 0.5,
            },
          ],
        },
      ],
    })
  })
})

// Captures plain JSON events, the shape posthog-js sends without compression.
async function captureEvents(
  items: Array<{
    event: string
    user: string
    at: string
    properties?: Record<string, unknown>
  }>,
) {
  const response = await app.request('/e/', {
    method: 'POST',
    body: JSON.stringify(
      items.map(({ event, user, at, properties }) => ({
        event,
        timestamp: at,
        properties: { token: project, distinct_id: user, ...properties },
      })),
    ),
  })
  expect(response.status).toBe(200)
}

async function queryCounts(body: object) {
  const response = await queryFunnel({
    project,
    from: '2026-09-01T00:00:00Z',
    to: '2026-09-10T00:00:00Z',
    ...body,
  })
  expect(response.status).toBe(200)
  const { results } = (await response.json()) as {
    results: Array<{
      breakdown: string | null
      steps: Array<{ count: number }>
    }>
  }
  return results.map((result) => ({
    breakdown: result.breakdown,
    counts: result.steps.map((step) => step.count),
  }))
}

describe('funnel', () => {
  it('does not count steps done out of order', async () => {
    await captureEvents([
      { event: 'created_concept', user: 'ada', at: '2026-09-01T09:00:00Z' },
      { event: 'signed_up', user: 'ada', at: '2026-09-01T10:00:00Z' },
    ])

    expect(
      await queryCounts({ steps: ['signed_up', 'created_concept'] }),
    ).toEqual([{ breakdown: null, counts: [1, 0] }])
  })

  it('counts a step only inside the window that opens at the first step', async () => {
    await captureEvents([
      { event: 'signed_up', user: 'ada', at: '2026-09-01T10:00:00Z' },
      { event: 'created_concept', user: 'ada', at: '2026-09-01T11:30:00Z' },
      { event: 'signed_up', user: 'bob', at: '2026-09-01T10:00:00Z' },
      { event: 'created_concept', user: 'bob', at: '2026-09-01T12:30:00Z' },
    ])

    expect(
      await queryCounts({
        steps: ['signed_up', 'created_concept'],
        window_hours: 2,
      }),
    ).toEqual([{ breakdown: null, counts: [2, 1] }])
  })

  it('counts each user once, at the deepest step reached', async () => {
    await captureEvents([
      { event: 'signed_up', user: 'ada', at: '2026-09-01T10:00:00Z' },
      { event: 'created_concept', user: 'ada', at: '2026-09-01T11:00:00Z' },
      { event: 'created_concept', user: 'ada', at: '2026-09-01T12:00:00Z' },
      { event: 'signed_up', user: 'ada', at: '2026-09-02T10:00:00Z' },
    ])

    expect(
      await queryCounts({
        steps: ['signed_up', 'created_concept'],
        window_hours: 2,
      }),
    ).toEqual([{ breakdown: null, counts: [1, 1] }])
  })

  it('splits users by the breakdown property of their first step', async () => {
    await captureEvents([
      {
        event: 'signed_up',
        user: 'ada',
        at: '2026-09-01T10:00:00Z',
        properties: { plan: 'team' },
      },
      { event: 'created_concept', user: 'ada', at: '2026-09-01T11:00:00Z' },
      {
        event: 'signed_up',
        user: 'bob',
        at: '2026-09-01T10:00:00Z',
        properties: { plan: 'free' },
      },
      {
        event: 'signed_up',
        user: 'cy',
        at: '2026-09-01T10:00:00Z',
        properties: { plan: 'free' },
      },
      { event: 'created_concept', user: 'cy', at: '2026-09-01T11:00:00Z' },
    ])

    expect(
      await queryCounts({
        steps: ['signed_up', 'created_concept'],
        breakdown: 'plan',
      }),
    ).toEqual([
      { breakdown: 'free', counts: [2, 1] },
      { breakdown: 'team', counts: [1, 1] },
    ])
  })
})

describe('query API', () => {
  it('answers 401 without the read key', async () => {
    const funnel = await app.request('/api/funnel', {
      method: 'POST',
      body: JSON.stringify({ project, steps: ['signed_up'] }),
    })
    const counts = await app.request(`/api/events?project=${project}`, {
      headers: { Authorization: 'Bearer wrong-key' },
    })

    expect(funnel.status).toBe(401)
    expect(counts.status).toBe(401)
  })

  it('counts an event per day', async () => {
    await captureEvents([
      { event: 'signed_up', user: 'ada', at: '2026-09-01T10:00:00Z' },
      { event: 'signed_up', user: 'bob', at: '2026-09-01T23:59:00Z' },
      { event: 'signed_up', user: 'cy', at: '2026-09-03T00:00:00Z' },
      { event: 'created_concept', user: 'cy', at: '2026-09-03T01:00:00Z' },
    ])

    const response = await app.request(
      `/api/events?project=${project}&event=signed_up&from=2026-09-01T00:00:00Z&to=2026-09-04T00:00:00Z`,
      { headers: { Authorization: `Bearer ${readKey}` } },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      days: [
        { date: '2026-09-01', count: 2 },
        { date: '2026-09-03', count: 1 },
      ],
    })
  })
})

describe('capture in posthog-js formats', () => {
  const event = {
    event: 'signed_up',
    properties: { token: project, distinct_id: 'ada' },
    timestamp: '2026-09-01T10:00:00Z',
  }

  async function querySignups() {
    return queryCounts({ steps: ['signed_up'] })
  }

  it('reads a gzip-js body', async () => {
    const response = await app.request('/i/v0/e/?compression=gzip-js', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: gzipSync(JSON.stringify([event])),
    })

    expect(response.status).toBe(200)
    expect(await querySignups()).toEqual([{ breakdown: null, counts: [1] }])
  })

  it('reads a base64 form body', async () => {
    const data = Buffer.from(JSON.stringify(event)).toString('base64')
    const response = await app.request('/e/?compression=base64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data }).toString(),
    })

    expect(response.status).toBe(200)
    expect(await querySignups()).toEqual([{ breakdown: null, counts: [1] }])
  })

  it('answers 400 to an event without a project key', async () => {
    const response = await app.request('/capture/', {
      method: 'POST',
      body: JSON.stringify({ event: 'signed_up', distinct_id: 'ada' }),
    })

    expect(response.status).toBe(400)
  })

  it('answers flag requests with no flags, and allows browsers', async () => {
    for (const path of ['/decide/?v=4', '/flags/?v=2']) {
      const response = await app.request(path, {
        method: 'POST',
        headers: { Origin: 'https://product.test' },
        body: JSON.stringify({ token: project, distinct_id: 'ada' }),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(await response.json()).toMatchObject({ featureFlags: {} })
    }
  })
})
