import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

const readKey = 'test-read-key'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
})

// Each test starts with an empty table and with row ids from 1. That is
// faster than a new database for each test.
beforeEach(async () => {
  await client.exec('truncate comments restart identity')
  app = createApp({ database, readKey })
})

afterAll(async () => {
  await client.close()
})

function postComment(body: object) {
  return app.request('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Adds comments on flexibeck at set times, as [author, created_at].
async function addComments(rows: string[][]) {
  await database.insert(schema.comments).values(
    rows.map(([author, createdAt]) => ({
      handle: 'flexibeck',
      author,
      text: `Comment by ${author}`,
      createdAt: new Date(createdAt),
    })),
  )
}

async function listComments(query: string) {
  const response = await app.request(`/api/comments?${query}`, {
    headers: { Authorization: `Bearer ${readKey}` },
  })
  expect(response.status).toBe(200)
  const { comments } = (await response.json()) as {
    comments: Array<{ author: string; text: string; created_at: string }>
  }
  return comments
}

describe('comments', () => {
  it('keeps the comments of one handle, oldest first', async () => {
    for (const [handle, author, text] of [
      ['flexibeck', 'ada', 'Love the new plans'],
      ['other', 'bob', 'Not about flexibeck'],
      ['flexibeck', 'cy', 'Too many options'],
    ]) {
      expect((await postComment({ handle, author, text })).status).toBe(201)
    }

    const comments = await listComments('handle=flexibeck')

    expect(comments.map(({ author, text }) => ({ author, text }))).toEqual([
      { author: 'ada', text: 'Love the new plans' },
      { author: 'cy', text: 'Too many options' },
    ])
  })

  it('lists only the comments after `since`', async () => {
    await postComment({ handle: 'flexibeck', author: 'ada', text: 'First' })
    const [first] = await listComments('handle=flexibeck')
    await postComment({ handle: 'flexibeck', author: 'bob', text: 'Second' })

    const comments = await listComments(
      `handle=flexibeck&since=${encodeURIComponent(first.created_at)}`,
    )

    expect(comments.map((comment) => comment.text)).toEqual(['Second'])
  })

  it('answers 400 to a comment without handle, author or text', async () => {
    for (const body of [
      { author: 'ada', text: 'No handle' },
      { handle: 'flexibeck', text: 'No author' },
      { handle: 'flexibeck', author: 'ada', text: '  ' },
      { handle: 'x'.repeat(101), author: 'ada', text: 'Long handle' },
      { handle: 'flexibeck', author: 'x'.repeat(101), text: 'Long author' },
      { handle: 'flexibeck', author: 'ada', text: 'x'.repeat(5001) },
    ]) {
      expect((await postComment(body)).status).toBe(400)
    }
  })

  it('keeps a comment at the length limits', async () => {
    const response = await postComment({
      handle: 'x'.repeat(100),
      author: 'x'.repeat(100),
      text: 'x'.repeat(5000),
    })

    expect(response.status).toBe(201)
  })

  it('answers 413 to a body larger than 64 KB', async () => {
    const response = await postComment({
      handle: 'flexibeck',
      author: 'ada',
      text: 'x'.repeat(65 * 1024),
    })

    expect(response.status).toBe(413)
  })

  it('lists only the comments up to `until`', async () => {
    await addComments([
      ['ada', '2026-09-30T09:59:00.000Z'],
      ['bob', '2026-09-30T09:59:50.000Z'],
      ['cy', '2026-09-30T09:59:51.000Z'],
    ])

    const comments = await listComments(
      'handle=flexibeck&until=2026-09-30T09:59:50.000Z',
    )

    expect(comments.map((comment) => comment.author)).toEqual(['ada', 'bob'])
  })

  it('lists 500 comments at most by default, the oldest', async () => {
    await addComments(
      Array.from({ length: 501 }, (_, index) => [
        `user${index}`,
        new Date(Date.UTC(2026, 8, 1) + index * 1000).toISOString(),
      ]),
    )

    const comments = await listComments('handle=flexibeck')

    expect(comments).toHaveLength(500)
    expect(comments.at(-1)?.author).toBe('user499')
  })

  it('lists `limit` comments, and never splits comments of the same time', async () => {
    await addComments([
      ['ada', '2026-09-30T09:00:00.000Z'],
      ['bob', '2026-09-30T09:00:01.000Z'],
      ['cy', '2026-09-30T09:00:01.000Z'],
      ['dee', '2026-09-30T09:00:02.000Z'],
    ])

    const firstPage = await listComments('handle=flexibeck&limit=2')
    const nextPage = await listComments(
      `handle=flexibeck&limit=2&since=${encodeURIComponent(firstPage.at(-1)!.created_at)}`,
    )

    expect(firstPage.map((comment) => comment.author).sort()).toEqual([
      'ada',
      'bob',
      'cy',
    ])
    expect(nextPage.map((comment) => comment.author)).toEqual(['dee'])
  })

  it('answers 400 to a bad `until` or `limit`', async () => {
    for (const query of ['until=today', 'limit=0', 'limit=501', 'limit=ten']) {
      const response = await app.request(
        `/api/comments?handle=flexibeck&${query}`,
        { headers: { Authorization: `Bearer ${readKey}` } },
      )

      expect(response.status).toBe(400)
    }
  })

  it('allows browsers to post', async () => {
    const response = await app.request('/api/comments', {
      method: 'POST',
      headers: {
        Origin: 'https://product.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ handle: 'flexibeck', author: 'ada', text: 'Hi' }),
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers 401 to a read without the read key', async () => {
    const response = await app.request('/api/comments?handle=flexibeck', {
      headers: { Authorization: 'Bearer wrong' },
    })

    expect(response.status).toBe(401)
  })

  it('answers 400 to a read without a handle or with a bad since', async () => {
    for (const query of ['', 'handle=flexibeck&since=yesterday']) {
      const response = await app.request(`/api/comments?${query}`, {
        headers: { Authorization: `Bearer ${readKey}` },
      })

      expect(response.status).toBe(400)
    }
  })
})
