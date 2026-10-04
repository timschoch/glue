import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach } from 'vitest'

// One migrated database for a test file. Call it at the top of the file,
// before the file's own hooks. Each test starts with empty tables and with
// row ids from 1. A new database for each test takes about 2 s, this reset
// takes a few milliseconds.
export function createTestDatabase<TSchema extends Record<string, unknown>>(
  schema: TSchema,
) {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  let tables = ''

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: './drizzle' })
    const found = await client.query<{ name: string }>(
      `select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
    )
    tables = found.rows.map(({ name }) => name).join(', ')
  })

  beforeEach(async () => {
    await client.exec(`truncate ${tables} restart identity cascade`)
  })

  afterAll(async () => {
    await client.close()
  })

  return { client, db }
}
