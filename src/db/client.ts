import type { PgDatabase } from 'drizzle-orm/pg-core'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import * as schema from './schema.ts'

export type ConceptDb = PgDatabase<any, typeof schema>

export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema })
}
