import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import type { Hono } from 'hono'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

// Vercel's Hono entry: it serves this default export. The preset finds the
// entry by its import from 'hono'.
const databaseUrl = process.env.MOCK_SOCIAL_DATABASE_URL
const readKey = process.env.MOCK_SOCIAL_READ_KEY
if (!databaseUrl || !readKey) {
  throw new Error('Set MOCK_SOCIAL_DATABASE_URL and MOCK_SOCIAL_READ_KEY')
}

const app: Hono = createApp({
  database: drizzle(neon(databaseUrl), { schema }),
  readKey,
})

export default app
