import path from 'node:path'

import { test as base } from '@playwright/test'
import { createServer } from 'vite'

// The first page waits for Vite to build the app.
const START_TIMEOUT_MS = 180_000

// A test with the address of the app: one Vite server for each worker, with
// the memory server of memory-server.ts.
export const test = base.extend<object, { address: string }>({
  address: [
    // Playwright reads the names of the fixtures from this pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const app = await createServer({
        configFile: path.join(import.meta.dirname, 'vite.config.ts'),
      })
      await app.listen()
      const [address] = app.resolvedUrls?.local ?? []
      await use(address)
      await app.close()
    },
    { scope: 'worker', timeout: START_TIMEOUT_MS },
  ],
})

test.setTimeout(START_TIMEOUT_MS)
