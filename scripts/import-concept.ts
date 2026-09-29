// Imports concept/ into the Product "glue" in Neon Postgres. Idempotent:
// running it twice changes nothing. Needs DATABASE_URL.
import { join } from 'node:path'

import { createDb } from '../src/db/client.ts'
import { importConcept } from '../src/db/import-concept.ts'
import { loadConcept } from './check-concept.mjs'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  const records = loadConcept(join(process.cwd(), 'concept'))
  const db = createDb(databaseUrl)
  await importConcept(db, records, 'glue')
}

main()
