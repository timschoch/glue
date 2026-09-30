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

  it('orders steps with the same timestamp by their place in the funnel', async () => {
    await captureEvents([
      { event: 'created_concept', user: 'ada', at: '2026-09-01T10:00:00Z' },
      { event: 'signed_up', user: 'ada', at: '2026-09-01T10:00:00Z' },
    ])

    expect(
      await queryCounts({ steps: ['signed_up', 'created_concept'] }),
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

function queryMean(body: object) {
  return app.request('/api/mean', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project,
      event: 'survey sent',
      property: 'answer',
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-10T00:00:00Z',
      ...body,
    }),
  })
}

describe('mean', () => {
  it('averages numbers and number strings, and skips other values', async () => {
    await captureEvents([
      {
        event: 'survey sent',
        user: 'ada',
        at: '2026-09-01T10:00:00Z',
        properties: { answer: 7 },
      },
      {
        event: 'survey sent',
        user: 'bob',
        at: '2026-09-02T10:00:00Z',
        properties: { answer: '4' },
      },
      {
        event: 'survey sent',
        user: 'cy',
        at: '2026-09-02T11:00:00Z',
        properties: { answer: 'great' },
      },
      { event: 'survey sent', user: 'dee', at: '2026-09-02T12:00:00Z' },
      {
        event: 'survey sent',
        user: 'eve',
        at: '2026-09-11T10:00:00Z',
        properties: { answer: 1 },
      },
      {
        event: 'survey shown',
        user: 'fay',
        at: '2026-09-02T10:00:00Z',
        properties: { answer: 1 },
      },
    ])

    const response = await queryMean({})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      results: [{ breakdown: null, count: 2, mean: 5.5 }],
    })
  })

  it('reads only the events whose property equals the filter value', async () => {
    await captureEvents([
      {
        event: 'survey sent',
        user: 'ada',
        at: '2026-09-01T10:00:00Z',
        properties: { answer: 7, survey: 'seq' },
      },
      {
        event: 'survey sent',
        user: 'bob',
        at: '2026-09-01T10:00:00Z',
        properties: { answer: 1, survey: 'nps' },
      },
    ])

    const response = await queryMean({
      where: { property: 'survey', value: 'seq' },
    })

    expect(await response.json()).toEqual({
      results: [{ breakdown: null, count: 1, mean: 7 }],
    })
  })

  it('splits the mean by the breakdown property, most answers first', async () => {
    await captureEvents([
      {
        event: 'survey sent',
        user: 'ada',
        at: '2026-09-01T10:00:00Z',
        properties: { answer: 7, plan: 'team' },
      },
      {
        event: 'survey sent',
        user: 'bob',
        at: '2026-09-01T10:00:00Z',
        properties: { answer: 2, plan: 'free' },
      },
      {
        event: 'survey sent',
        user: 'cy',
        at: '2026-09-01T10:00:00Z',
        properties: { answer: 5, plan: 'free' },
      },
    ])

    const response = await queryMean({ breakdown: 'plan' })

    expect(await response.json()).toEqual({
      results: [
        { breakdown: 'free', count: 2, mean: 3.5 },
        { breakdown: 'team', count: 1, mean: 7 },
      ],
    })
  })

  it('answers a mean of null when no event has a number', async () => {
    const response = await queryMean({})

    expect(await response.json()).toEqual({
      results: [{ breakdown: null, count: 0, mean: null }],
    })
  })

  it('answers 400 without a property', async () => {
    const response = await queryMean({ property: undefined })

    expect(response.status).toBe(400)
  })

  it.each([
    ['a string', 'survey=seq'],
    ['no value', { property: 'survey' }],
    ['an object value', { property: 'survey', value: { id: 'seq' } }],
  ])('answers 400 for a where filter with %s', async (_case, where) => {
    const response = await queryMean({ where })

    expect(response.status).toBe(400)
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

describe('identify', () => {
  it('counts the anonymous and the identified id as one person in a funnel', async () => {
    await captureEvents([
      { event: 'signed_up', user: 'anon-1', at: '2026-09-01T10:00:00Z' },
      {
        event: '$identify',
        user: 'baker',
        at: '2026-09-01T10:01:00Z',
        properties: { $anon_distinct_id: 'anon-1' },
      },
      { event: 'recipe_imported', user: 'baker', at: '2026-09-01T10:02:00Z' },
    ])

    expect(
      await queryCounts({ steps: ['signed_up', 'recipe_imported'] }),
    ).toEqual([{ breakdown: null, counts: [1, 1] }])
  })

  it('merges the ids when the identify falls outside the query dates', async () => {
    await captureEvents([
      { event: 'signed_up', user: 'anon-1', at: '2026-09-01T10:00:00Z' },
      { event: 'recipe_imported', user: 'baker', at: '2026-09-01T11:00:00Z' },
      {
        event: '$identify',
        user: 'baker',
        at: '2026-09-20T10:00:00Z',
        properties: { $anon_distinct_id: 'anon-1' },
      },
    ])

    expect(
      await queryCounts({ steps: ['signed_up', 'recipe_imported'] }),
    ).toEqual([{ breakdown: null, counts: [1, 1] }])
  })

  it('merges every anonymous id of a person, and no id of another project', async () => {
    await captureEvents([
      { event: 'signed_up', user: 'anon-1', at: '2026-09-01T10:00:00Z' },
      {
        event: '$identify',
        user: 'baker',
        at: '2026-09-01T10:01:00Z',
        properties: { $anon_distinct_id: 'anon-1' },
      },
      {
        event: '$identify',
        user: 'baker',
        at: '2026-09-02T10:00:00Z',
        properties: { $anon_distinct_id: 'anon-2' },
      },
      { event: 'recipe_imported', user: 'anon-2', at: '2026-09-02T10:01:00Z' },
      { event: 'signed_up', user: 'anon-3', at: '2026-09-01T10:00:00Z' },
    ])
    const response = await app.request('/e/', {
      method: 'POST',
      body: JSON.stringify({
        event: '$identify',
        timestamp: '2026-09-01T10:02:00Z',
        properties: {
          token: 'phc_other',
          distinct_id: 'anon-3',
          $anon_distinct_id: 'anon-1',
        },
      }),
    })
    expect(response.status).toBe(200)

    expect(
      await queryCounts({ steps: ['signed_up', 'recipe_imported'] }),
    ).toEqual([{ breakdown: null, counts: [2, 1] }])
  })
})

function queryValues(body: object) {
  return app.request('/api/values', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project,
      event: 'survey_answered',
      property: 'comment',
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-10T00:00:00Z',
      ...body,
    }),
  })
}

describe('values', () => {
  it('lists the values most frequent first, and skips empty values', async () => {
    await captureEvents([
      {
        event: 'survey_answered',
        user: 'ada',
        at: '2026-09-01T10:00:00Z',
        properties: { comment: 'bigger font' },
      },
      {
        event: 'survey_answered',
        user: 'bob',
        at: '2026-09-01T11:00:00Z',
        properties: { comment: 'a video of each step' },
      },
      {
        event: 'survey_answered',
        user: 'cy',
        at: '2026-09-01T12:00:00Z',
        properties: { comment: 'a video of each step' },
      },
      {
        event: 'survey_answered',
        user: 'dee',
        at: '2026-09-01T13:00:00Z',
        properties: { comment: '  ' },
      },
      {
        event: 'survey_answered',
        user: 'eve',
        at: '2026-09-01T14:00:00Z',
        properties: { comment: null },
      },
      { event: 'survey_answered', user: 'fay', at: '2026-09-01T15:00:00Z' },
      {
        event: 'survey_answered',
        user: 'gus',
        at: '2026-09-11T10:00:00Z',
        properties: { comment: 'too late' },
      },
      {
        event: 'survey_shown',
        user: 'hal',
        at: '2026-09-01T10:00:00Z',
        properties: { comment: 'other event' },
      },
    ])

    const response = await queryValues({})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      results: [
        {
          breakdown: null,
          values: [
            { value: 'a video of each step', count: 2 },
            { value: 'bigger font', count: 1 },
          ],
        },
      ],
    })
  })

  it('filters with where, and splits by the breakdown property', async () => {
    await captureEvents([
      {
        event: 'survey_answered',
        user: 'ada',
        at: '2026-09-01T10:00:00Z',
        properties: { question: 'seq', score: 5, plan: 'free' },
      },
      {
        event: 'survey_answered',
        user: 'bob',
        at: '2026-09-01T10:00:00Z',
        properties: { question: 'seq', score: 5, plan: 'free' },
      },
      {
        event: 'survey_answered',
        user: 'cy',
        at: '2026-09-01T10:00:00Z',
        properties: { question: 'seq', score: 7, plan: 'team' },
      },
      {
        event: 'survey_answered',
        user: 'dee',
        at: '2026-09-01T10:00:00Z',
        properties: { question: 'nps', score: 9, plan: 'team' },
      },
    ])

    const response = await queryValues({
      property: 'score',
      where: { property: 'question', value: 'seq' },
      breakdown: 'plan',
    })

    expect(await response.json()).toEqual({
      results: [
        { breakdown: 'free', values: [{ value: '5', count: 2 }] },
        { breakdown: 'team', values: [{ value: '7', count: 1 }] },
      ],
    })
  })

  it('returns at most limit values', async () => {
    await captureEvents(
      ['video', 'video', 'font', 'print'].map((comment, index) => ({
        event: 'survey_answered',
        user: `user-${index}`,
        at: '2026-09-01T10:00:00Z',
        properties: { comment },
      })),
    )

    const response = await queryValues({ limit: 1 })

    expect(await response.json()).toEqual({
      results: [{ breakdown: null, values: [{ value: 'video', count: 2 }] }],
    })
  })

  it.each([0, 1001, 2.5, '10'])(
    'answers 400 for the limit %s',
    async (limit) => {
      const response = await queryValues({ limit })

      expect(response.status).toBe(400)
    },
  )

  it('answers 401 without the read key', async () => {
    const response = await app.request('/api/values', {
      method: 'POST',
      body: JSON.stringify({ project }),
    })

    expect(response.status).toBe(401)
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

  it('reads raw gzip bytes with no compression marker', async () => {
    const response = await app.request(
      '/i/v0/e/?ver=1.435.0&sent_at=1790000000000',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: gzipSync(JSON.stringify([event])),
      },
    )

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

  it('stores a batch larger than one insert can take', async () => {
    const eventCount = 14_000
    const response = await app.request('/batch/', {
      method: 'POST',
      body: JSON.stringify({
        api_key: project,
        batch: Array.from({ length: eventCount }, (_, index) => ({
          event: 'signed_up',
          distinct_id: `user-${index}`,
          timestamp: '2026-09-01T10:00:00Z',
        })),
      }),
    })

    expect(response.status).toBe(200)
    expect(await querySignups()).toEqual([
      { breakdown: null, counts: [eventCount] },
    ])
  })

  it('answers 413 to a body over the size limit', async () => {
    const response = await app.request('/e/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'x'.repeat(6 * 1024 * 1024),
    })

    expect(response.status).toBe(413)
  })

  it('answers 413 to gzip that inflates past the size limit', async () => {
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024, ' '))
    const response = await app.request('/i/v0/e/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: bomb,
    })

    expect(bomb.byteLength).toBeLessThan(1024 * 1024)
    expect(response.status).toBe(413)
  })

  it('answers 400 to an event without a project key', async () => {
    const response = await app.request('/capture/', {
      method: 'POST',
      body: JSON.stringify({ event: 'signed_up', distinct_id: 'ada' }),
    })

    expect(response.status).toBe(400)
  })

  it('answers the remote config requests with an empty object', async () => {
    for (const path of [
      `/array/${project}/config`,
      `/array/${project}/config.js`,
    ]) {
      const response = await app.request(path)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('{}')
    }
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
