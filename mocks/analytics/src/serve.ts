import { PGlite } from '@electric-sql/pglite'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

// Local server. With MOCK_ANALYTICS_DATABASE_URL set it serves the Vercel
// entry; without it, an in-memory PGlite database that lives as long as the
// process.
const port = Number(process.env.PORT ?? 4000)
const readKey = process.env.MOCK_ANALYTICS_READ_KEY ?? 'local-read-key'

async function createLocalApp() {
  if (process.env.MOCK_ANALYTICS_DATABASE_URL) {
    return (await import('./index.ts')).default
  }
  const database = drizzle(new PGlite(), { schema })
  await migrate(database, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  return createApp({ database, readKey })
}

const app = await createLocalApp()
serve({ fetch: app.fetch, port }, () => {
  console.log(`mock-analytics on http://localhost:${port}`)
})
