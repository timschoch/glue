import { readFile, readdir } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord } from './concept-records.ts'
import * as schema from './schema.ts'

const countersMigration = '0005_record_counters.sql'

let client: PGlite

async function runMigration(file: string) {
  await client.exec(await readFile(`./drizzle/${file}`, 'utf8'))
}

beforeEach(async () => {
  client = new PGlite()
  const files = (await readdir('./drizzle')).filter((file) =>
    file.endsWith('.sql'),
  )
  for (const file of files.sort()) {
    if (file < countersMigration) await runMigration(file)
  }
})

afterEach(async () => {
  await client.close()
})

describe('the migration that adds the record counters', () => {
  it('starts each counter at the highest number of its Product and folder', async () => {
    await client.exec(`
      insert into products (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
      insert into facts (product_id, record_id, title, source) values
        (1, 'F2', 'An export is one request', 'API contract'),
        (1, 'F10', 'CI takes ten minutes', 'verify ci'),
        (2, 'F3', 'A baker starts at four', 'interview');
    `)

    await runMigration(countersMigration)

    const counters = await client.query(
      'select product_id, folder, last_number from record_counters order by product_id',
    )
    expect(counters.rows).toEqual([
      { product_id: 1, folder: 'facts', last_number: 10 },
      { product_id: 2, folder: 'facts', last_number: 3 },
    ])
  })

  it('gives the next record the number after the highest one', async () => {
    await client.exec(`
      insert into products (slug, name) values ('glue', 'Glue');
      insert into facts (product_id, record_id, title, source) values
        (1, 'F2', 'An export is one request', 'API contract');
    `)

    await runMigration(countersMigration)

    const id = await addConceptRecord(
      drizzle(client, { schema }),
      'glue',
      'facts',
      { title: 'CI takes ten minutes', source: 'verify ci' },
      '',
    )
    expect(id).toBe('F3')
  })
})
