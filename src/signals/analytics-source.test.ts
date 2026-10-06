import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The test reads the Mock itself, so the adapter and the Mock cannot drift
// apart. The adapter never imports the Mock.
import { createApp } from '../../mocks/analytics/src/create-app.ts'
import * as mockSchema from '../../mocks/analytics/src/schema.ts'
import { createSurveyEvents } from '../../mocks/analytics/src/survey-events.ts'
import { createAnalyticsSource } from './analytics-source.ts'

const READ_KEY = 'test-read-key'
const now = () => new Date('2026-10-05T12:00:00Z')

let client: PGlite
let app: ReturnType<typeof createApp>

// Sends each request to the Mock and keeps it.
const requests: Request[] = []
const mockFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  requests.push(request.clone())
  return app.request(request)
}

// Three people answered the survey of flexibeck: Ada found it hard and said
// why, Bob found it hard, Cy found it easy. Dee found it hard 31 days ago.
beforeAll(async () => {
  client = new PGlite()
  const database = drizzle(client, { schema: mockSchema })
  await migrate(database, {
    migrationsFolder: new URL('../../mocks/analytics/drizzle', import.meta.url)
      .pathname,
  })
  app = createApp({ database, readKey: READ_KEY })
  const answers = [
    ['ada', '2026-10-02T10:00:00Z', 2, 'Too many options to pick from'],
    ['bob', '2026-10-03T09:00:00Z', 3, ''],
    ['cy', '2026-10-03T10:00:00Z', 6, ''],
    ['dee', '2026-09-04T10:00:00Z', 1, 'The forms took too long'],
  ] as const
  await app.request('/e/', {
    method: 'POST',
    body: JSON.stringify(
      answers.map(([user, at, score, comment]) => ({
        event: 'survey sent',
        timestamp: at,
        properties: {
          token: 'phc_flexibeck',
          distinct_id: user,
          $survey_response: score,
          comment,
        },
      })),
    ),
  })
})

afterAll(async () => {
  await client.close()
})

const flexibeck = {
  repository: null,
  supportUrl: null,
  analyticsProject: 'phc_flexibeck',
}

function createSource(readKey = READ_KEY) {
  return createAnalyticsSource({
    url: 'https://analytics.test',
    readKey,
    now,
    fetch: mockFetch,
  })
}

describe('createAnalyticsSource', () => {
  it('reads the survey answers of the last 30 days with a score of 3 or less', async () => {
    const signals = await createSource().listSignals(flexibeck)

    expect(
      signals.map(({ url, ...signal }) => ({
        ...signal,
        hasAddress: /^https:\/\/analytics\.test\/events\/[0-9a-f-]{36}$/.test(
          url,
        ),
      })),
    ).toEqual([
      {
        title: 'Survey answer 3 of 7',
        text: '',
        date: '2026-10-03',
        hasAddress: true,
      },
      {
        title: 'Survey answer 2 of 7',
        text: 'Too many options to pick from',
        date: '2026-10-02',
        hasAddress: true,
      },
    ])
  })

  it('asks the metric source one time, with the read key', async () => {
    requests.length = 0

    await createSource().listSignals(flexibeck)

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'POST https://analytics.test/api/low-values',
    ])
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${READ_KEY}`)
    expect(await requests[0].json()).toEqual({
      project: 'phc_flexibeck',
      event: 'survey sent',
      property: '$survey_response',
      at_most: 3,
      from: '2026-09-05T12:00:00.000Z',
      to: '2026-10-05T12:00:00.000Z',
    })
  })

  it('has the name analytics', () => {
    expect(createSource().name).toBe('analytics')
  })

  it('gives no Signal and asks nothing for a Project without an analytics project', async () => {
    requests.length = 0

    const signals = await createSource().listSignals({
      ...flexibeck,
      analyticsProject: null,
    })

    expect(signals).toEqual([])
    expect(requests).toEqual([])
  })

  it.each([
    { url: undefined, readKey: READ_KEY },
    { url: 'https://analytics.test', readKey: undefined },
  ])(
    'fails when the Project has an analytics project and Glue has no metric source',
    async (settings) => {
      const source = createAnalyticsSource({
        ...settings,
        now,
        fetch: mockFetch,
      })

      await expect(source.listSignals(flexibeck)).rejects.toThrow(
        'Analytics has no address or no read key',
      )
    },
  )

  it('gives no Signal for a Project without an analytics project when Glue has no metric source', async () => {
    const source = createAnalyticsSource({
      url: undefined,
      readKey: undefined,
      now,
      fetch: mockFetch,
    })

    expect(
      await source.listSignals({ ...flexibeck, analyticsProject: null }),
    ).toEqual([])
  })

  it('fails with the status when the metric source refuses the read', async () => {
    await expect(createSource('wrong').listSignals(flexibeck)).rejects.toThrow(
      'Analytics answered 401',
    )
  })
})

// The seed of the Mock ran one time, on 2026-10-05.
describe('createAnalyticsSource with the seed of the Mock', () => {
  const seeded = {
    repository: null,
    supportUrl: null,
    analyticsProject: 'phc_seeded',
  }

  beforeAll(async () => {
    await app.request('/e/', {
      method: 'POST',
      body: JSON.stringify(
        createSurveyEvents(now()).map(
          ({ distinctId, event, timestamp, properties }) => ({
            event,
            timestamp: timestamp.toISOString(),
            properties: {
              ...properties,
              token: seeded.analyticsProject,
              distinct_id: distinctId,
            },
          }),
        ),
      ),
    })
  })

  it.each([
    { day: '2026-10-05', oldest: '2026-09-05' },
    { day: '2026-11-19', oldest: '2026-10-20' },
    { day: '2027-01-03', oldest: '2026-12-04' },
  ])('gives Signals of the last 30 days on $day', async ({ day, oldest }) => {
    const source = createAnalyticsSource({
      url: 'https://analytics.test',
      readKey: READ_KEY,
      now: () => new Date(`${day}T12:00:00Z`),
      fetch: mockFetch,
    })

    const signals = await source.listSignals(seeded)

    expect(signals.length).toBeGreaterThanOrEqual(10)
    expect(signals.every(({ date }) => date >= oldest && date < day)).toBe(true)
    expect(signals.some(({ text }) => text !== '')).toBe(true)
  })
})
