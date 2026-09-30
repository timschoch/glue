import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import { createApp } from './create-app.ts'
import * as schema from './schema.ts'

// Vercel's Hono entry: it serves this default export.
const databaseUrl = process.env.MOCK_ANALYTICS_DATABASE_URL
const readKey = process.env.MOCK_ANALYTICS_READ_KEY
if (!databaseUrl || !readKey) {
  throw new Error('Set MOCK_ANALYTICS_DATABASE_URL and MOCK_ANALYTICS_READ_KEY')
}

export default createApp({
  database: drizzle(neon(databaseUrl), { schema }),
  readKey,
})
