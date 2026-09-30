import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

const readKey = 'test-read-key'

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

function postComment(body: object) {
  return app.request('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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
      { handle: 'flexibeck', author: 'ada', text: 'x'.repeat(5001) },
    ]) {
      expect((await postComment(body)).status).toBe(400)
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
