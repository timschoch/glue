import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord } from './concept-records.ts'
import * as schema from './schema.ts'
import { findProductByToken } from './tokens.ts'

const countersMigration = '0005_record_counters.sql'
const goalStatusMigration = '0006_goal_mean_status.sql'
const projectsMigration = '0009_projects.sql'

let client: PGlite

async function runMigration(file: string) {
  await client.exec(await readFile(`./drizzle/${file}`, 'utf8'))
}

async function listMigrations() {
  const files = await readdir('./drizzle')
  return files.filter((file) => file.endsWith('.sql')).sort()
}

// Runs the migrations that come before `migration`.
async function runMigrationsBefore(migration: string) {
  for (const file of await listMigrations()) {
    if (file < migration) await runMigration(file)
  }
}

// Runs the migrations that come after `migration`, so app code finds the
// current schema.
async function runMigrationsAfter(migration: string) {
  for (const file of await listMigrations()) {
    if (file > migration) await runMigration(file)
  }
}

beforeEach(() => {
  client = new PGlite()
})

afterEach(async () => {
  await client.close()
})

describe('the migration that adds the record counters', () => {
  beforeEach(() => runMigrationsBefore(countersMigration))

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
    await runMigrationsAfter(countersMigration)

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

describe('the migration that adds the Goal status and the mean measure', () => {
  beforeEach(() => runMigrationsBefore(goalStatusMigration))

  it('marks each stored measure object as a funnel, and each Goal as open', async () => {
    await client.exec(`
      insert into products (slug, name) values ('glue', 'Glue');
      insert into goals (product_id, record_id, title, metric, source, measure) values
        (1, 'G1', 'More users pay', 'signup to paid', 'okr',
          '{"source":"mock-analytics","steps":["signed-up","paid"],"target":0.2,"window_days":7}'),
        (1, 'G2', 'Ship faster', 'lead time', 'okr', null),
        (1, 'G3', 'Fewer errors', 'error rate', 'okr', '["errors"]');
    `)

    await runMigration(goalStatusMigration)

    const goals = await client.query(
      'select record_id, status, baseline, measure from goals order by record_id',
    )
    expect(goals.rows).toEqual([
      {
        record_id: 'G1',
        status: 'open',
        baseline: null,
        measure: {
          kind: 'funnel',
          source: 'mock-analytics',
          steps: ['signed-up', 'paid'],
          target: 0.2,
          window_days: 7,
        },
      },
      { record_id: 'G2', status: 'open', baseline: null, measure: null },
      {
        record_id: 'G3',
        status: 'open',
        baseline: null,
        measure: ['errors'],
      },
    ])
  })
})

describe('the migration that renames Product to Project', () => {
  const token = 'glue_orchestrator'

  beforeEach(async () => {
    await runMigrationsBefore(projectsMigration)
    await client.exec(`
      create role glue_ci;
      grant select on products, tokens to glue_ci;
      insert into products (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
    `)
    await client.query(
      'insert into tokens (product_id, name, hash) values (2, $1, $2)',
      ['orchestrator', createHash('sha256').update(token).digest('hex')],
    )
    await runMigration(projectsMigration)
  })

  it('keeps each Product as a Project', async () => {
    const projects = await client.query(
      'select id, slug, name from projects order by id',
    )
    expect(projects.rows).toEqual([
      { id: 1, slug: 'glue', name: 'Glue' },
      { id: 2, slug: 'flexibeck', name: 'flexibeck' },
    ])
  })

  it('still opens the Project of a token', async () => {
    await runMigrationsAfter(projectsMigration)

    const project = await findProductByToken(drizzle(client, { schema }), token)
    expect(project).toBe('flexibeck')
  })

  describe('for the code from before the migration', () => {
    it('still returns the Projects as products', async () => {
      const products = await client.query(
        'select id, slug, name from products order by id',
      )
      expect(products.rows).toEqual([
        { id: 1, slug: 'glue', name: 'Glue' },
        { id: 2, slug: 'flexibeck', name: 'flexibeck' },
      ])
    })

    it('still adds and updates a Product through products', async () => {
      const added = await client.query(`
        insert into "products" ("id", "slug", "name")
        values (default, 'bakeday', 'bakeday'), (default, 'glue', 'glue')
        on conflict ("slug") do update set "slug" = excluded."slug"
        returning "id"
      `)
      expect(added.rows).toEqual([{ id: 3 }, { id: 1 }])

      await client.query(
        `update "products" set "repository" = 'timschoch/glue' where "slug" = 'glue'`,
      )
      const projects = await client.query(
        `select repository from projects where slug = 'glue'`,
      )
      expect(projects.rows).toEqual([{ repository: 'timschoch/glue' }])
    })

    it('still joins a token to its Product by product_id', async () => {
      const found = await client.query(`
        select "products"."slug" from "tokens"
        inner join "products" on "tokens"."product_id" = "products"."id"
      `)
      expect(found.rows).toEqual([{ slug: 'flexibeck' }])
    })

    it('gives the glue_ci role the same rights on the old and the new names', async () => {
      const rights = await client.query(`
        select
          has_table_privilege('glue_ci', 'projects', 'select') as projects,
          has_table_privilege('glue_ci', 'products', 'select') as products,
          has_table_privilege('glue_ci', 'products', 'insert') as products_insert,
          has_column_privilege('glue_ci', 'tokens', 'project_id', 'select') as project_id,
          has_column_privilege('glue_ci', 'tokens', 'product_id', 'select') as product_id
      `)
      expect(rights.rows).toEqual([
        {
          projects: true,
          products: true,
          products_insert: false,
          project_id: true,
          product_id: true,
        },
      ])
    })
  })
})
