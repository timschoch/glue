import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The test reads the Mock itself, so the adapter and the Mock cannot drift
// apart. The adapter never imports the Mock.
import { createApp } from '../../mocks/social/src/create-app.ts'
import * as mockSchema from '../../mocks/social/src/schema.ts'
import { createSocialSource } from './social-source.ts'

const READ_KEY = 'test-read-key'
const now = () => new Date('2026-10-05T12:00:00Z')
const ADA_ID = '11111111-1111-4111-8111-111111111111'
const BOB_ID = '22222222-2222-4222-8222-222222222222'

let client: PGlite
let app: ReturnType<typeof createApp>

// Sends each request to the Mock and keeps it.
const requests: Request[] = []
const mockFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  requests.push(request.clone())
  return app.request(request)
}

// Ada and Bob wrote about flexibeck in the last 30 days, Cy 31 days ago.
// Dee wrote about another Product.
beforeAll(async () => {
  client = new PGlite()
  const database = drizzle(client, { schema: mockSchema })
  await migrate(database, {
    migrationsFolder: new URL('../../mocks/social/drizzle', import.meta.url)
      .pathname,
  })
  app = createApp({ database, readKey: READ_KEY })
  await database.insert(mockSchema.comments).values([
    {
      id: ADA_ID,
      handle: 'flexibeck',
      author: 'ada',
      text: 'Too many options to pick from',
      createdAt: new Date('2026-10-02T10:00:00Z'),
    },
    {
      id: BOB_ID,
      handle: 'flexibeck',
      author: 'bob',
      text: 'The plan for the week helps me a lot',
      createdAt: new Date('2026-10-03T09:00:00Z'),
    },
    {
      handle: 'flexibeck',
      author: 'cy',
      text: 'The forms took too long',
      createdAt: new Date('2026-09-04T10:00:00Z'),
    },
    {
      handle: 'other',
      author: 'dee',
      text: 'Not about flexibeck',
      createdAt: new Date('2026-10-03T10:00:00Z'),
    },
  ])
})

afterAll(async () => {
  await client.close()
})

const flexibeck = {
  repository: null,
  supportUrl: null,
  analyticsProject: null,
  marketUrl: null,
  socialHandle: 'flexibeck',
}

function createSource(readKey = READ_KEY) {
  return createSocialSource({
    url: 'https://social.test',
    readKey,
    now,
    fetch: mockFetch,
  })
}

describe('createSocialSource', () => {
  it('reads the Comments of the last 30 days under the social handle of the Project, newest first', async () => {
    const signals = await createSource().listSignals(flexibeck)

    expect(signals).toEqual([
      {
        url: `https://social.test/comments/${BOB_ID}`,
        title: 'Comment of bob',
        titleBy: 'glue',
        text: 'The plan for the week helps me a lot',
        date: '2026-10-03',
      },
      {
        url: `https://social.test/comments/${ADA_ID}`,
        title: 'Comment of ada',
        titleBy: 'glue',
        text: 'Too many options to pick from',
        date: '2026-10-02',
      },
    ])
  })

  it('asks the social channel one time, with the read key', async () => {
    requests.length = 0

    await createSource().listSignals(flexibeck)

    expect(requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET https://social.test/api/comments?handle=flexibeck&since=2026-09-05T12%3A00%3A00.000Z&until=2026-10-05T12%3A00%3A00.000Z&order=newest',
    ])
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${READ_KEY}`)
  })

  it('has the name social', () => {
    expect(createSource().name).toBe('social')
  })

  it('gives no Signal and asks nothing for a Project without a social handle', async () => {
    requests.length = 0

    const signals = await createSource().listSignals({
      ...flexibeck,
      socialHandle: null,
    })

    expect(signals).toEqual([])
    expect(requests).toEqual([])
  })

  it.each([
    { url: undefined, readKey: READ_KEY },
    { url: 'https://social.test', readKey: undefined },
  ])(
    'fails when the Project has a social handle and Glue has no social channel',
    async (settings) => {
      const source = createSocialSource({ ...settings, now, fetch: mockFetch })

      await expect(source.listSignals(flexibeck)).rejects.toThrow(
        'Social has no address or no read key',
      )
    },
  )

  it('fails with the status when the social channel refuses the read', async () => {
    await expect(createSource('wrong').listSignals(flexibeck)).rejects.toThrow(
      'Social answered 401',
    )
  })
})
