// @vitest-environment jsdom
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

const readKey = 'test-read-key'
const project = 'phc_browser'

let client: PGlite
let app: ReturnType<typeof createApp>
const captures: Array<{
  url: string
  contentType: string | null
  status: number
}> = []

beforeEach(async () => {
  client = new PGlite()
  const database = drizzle(client, { schema })
  await migrate(database, {
    migrationsFolder: `${import.meta.dirname}/../drizzle`,
  })
  app = createApp({ database, readKey })

  // The network hop: only method, URL, headers and body reach the server.
  // Browser-only fetch flags like `keepalive` stay behind.
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    const response = await app.request(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
    })
    if (new URL(request.url).pathname.endsWith('/e/')) {
      captures.push({
        url: request.url,
        contentType: request.headers.get('content-type'),
        status: response.status,
      })
    }
    return response
  }
})

afterEach(async () => {
  await client.close()
})

it('stores what the browser posthog-js sends, and a funnel reads it back', async () => {
  // posthog-js keeps the fetch it finds at import time.
  const { default: posthog } = await import('posthog-js')
  posthog.init(project, {
    api_host: 'http://mock.test',
    persistence: 'memory',
    bootstrap: { distinctID: 'ada' },
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
  })
  posthog.capture('signed_up')
  posthog.capture('created_concept')

  await vi.waitFor(
    async () => {
      const response = await app.request('/api/funnel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${readKey}` },
        body: JSON.stringify({
          project,
          steps: ['signed_up', 'created_concept'],
          from: new Date(Date.now() - 60_000).toISOString(),
          to: new Date(Date.now() + 60_000).toISOString(),
        }),
      })
      const { results } = (await response.json()) as {
        results: Array<{ steps: Array<{ count: number }> }>
      }
      expect(results[0].steps.map((step) => step.count)).toEqual([1, 1])
    },
    { timeout: 10_000, interval: 200 },
  )
  expect(captures.length).toBeGreaterThan(0)
  expect(captures.every((capture) => capture.status === 200)).toBe(true)
}, 15_000)
