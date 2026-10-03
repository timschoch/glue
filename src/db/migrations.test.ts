import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord } from './concept-records.ts'
import { kinds } from './kinds.ts'
import * as schema from './schema.ts'
import { findProductByToken } from './tokens.ts'

const countersMigration = '0005_record_counters.sql'
const goalStatusMigration = '0006_goal_mean_status.sql'
const projectsMigration = '0009_projects.sql'
const partTablesMigration = '0010_part_tables.sql'

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

describe('the migration that adds the tables of the Part model', () => {
  // Project 1 is glue with the root Concept 1 and the Concept 2 in it.
  // Project 2 is flexibeck with the root Concept 3.
  // Part 1 is the Goal G1, Part 2 the Insight I1, Part 3 the Decision D1.
  // D1 needs G1.
  beforeEach(async () => {
    await runMigrationsBefore(partTablesMigration)
    await client.exec(`
      create role glue_ci;
      grant select on projects to glue_ci;
      insert into projects (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
    `)
    await runMigration(partTablesMigration)
    await client.exec(`
      insert into concepts (project_id, parent_id, slug, title, kind) values
        (1, null, 'glue', 'Glue', null),
        (1, 1, 'part-model', 'Part model', 'brief'),
        (2, null, 'flexibeck', 'flexibeck', null);
      insert into parts (project_id, concept_id, type, record_id, title, status, metric, source) values
        (1, 1, 'goal', 'G1', 'More users pay', 'open', 'signup to paid', 'okr');
      insert into parts (project_id, concept_id, type, record_id, title, date, source, evidence_level) values
        (1, 2, 'insight', 'I1', 'Bakers want step videos', '2026-10-01', 'interview', 'pattern');
      insert into parts (project_id, concept_id, type, record_id, title, status, date, owner) values
        (1, 2, 'decision', 'D1', 'Show the video of the creator', 'accepted', '2026-10-02', 'Tim');
      insert into joints (part_id, needed_part_id) values (3, 1);
    `)
  })

  it('holds the Parts, Joints and measures that the schema describes', async () => {
    const db = drizzle(client, { schema })
    await db.insert(schema.joints).values({ partId: 3, neededPartId: 2 })
    await db.insert(schema.measures).values({
      partId: 1,
      measure: {
        kind: 'funnel',
        source: 'mock-analytics',
        steps: ['signed-up', 'paid'],
        target: 0.2,
        window_days: 7,
      },
    })
    await db
      .insert(schema.partCounters)
      .values({ projectId: 1, type: 'decision', lastNumber: 1 })

    const concepts = await db
      .select({ slug: schema.concepts.slug, kind: schema.concepts.kind })
      .from(schema.concepts)
      .orderBy(schema.concepts.id)
    expect(concepts).toEqual([
      { slug: 'glue', kind: null },
      { slug: 'part-model', kind: 'brief' },
      { slug: 'flexibeck', kind: null },
    ])
    const parts = await db
      .select({
        recordId: schema.parts.recordId,
        type: schema.parts.type,
        conceptId: schema.parts.conceptId,
        body: schema.parts.body,
        evidenceLevel: schema.parts.evidenceLevel,
      })
      .from(schema.parts)
      .orderBy(schema.parts.id)
    expect(parts).toEqual([
      {
        recordId: 'G1',
        type: 'goal',
        conceptId: 1,
        body: '',
        evidenceLevel: null,
      },
      {
        recordId: 'I1',
        type: 'insight',
        conceptId: 2,
        body: '',
        evidenceLevel: 'pattern',
      },
      {
        recordId: 'D1',
        type: 'decision',
        conceptId: 2,
        body: '',
        evidenceLevel: null,
      },
    ])
    const joints = await db
      .select()
      .from(schema.joints)
      .orderBy(schema.joints.id)
    expect(joints).toEqual([
      { id: 1, partId: 3, neededPartId: 1, twoWay: false },
      { id: 2, partId: 3, neededPartId: 2, twoWay: false },
    ])
    const measures = await db
      .select({
        partId: schema.measures.partId,
        baseline: schema.measures.baseline,
      })
      .from(schema.measures)
    expect(measures).toEqual([{ partId: 1, baseline: null }])
    expect(await db.select().from(schema.partCounters)).toEqual([
      { projectId: 1, type: 'decision', lastNumber: 1 },
    ])
  })

  it('takes each Kind of the code as the kind of a Concept', async () => {
    expect(Object.keys(kinds)).toEqual(['brief'])
    for (const kind of Object.keys(kinds)) {
      await client.query(
        `insert into concepts (project_id, parent_id, slug, title, kind) values (1, 1, $1, $1, $1)`,
        [kind],
      )
    }
  })

  it('refuses a Concept of a Kind that the code does not have', async () => {
    await expect(
      client.exec(`
        insert into concepts (project_id, parent_id, slug, title, kind)
        values (1, 1, 'prd', 'PRD', 'prd')
      `),
    ).rejects.toThrow(/concepts_kind_check/)
  })

  it('refuses a Part of a wrong type', async () => {
    await expect(
      client.exec(`
        insert into parts (project_id, concept_id, type, record_id, title)
        values (1, 1, 'fact', 'F1', 'CI takes ten minutes')
      `),
    ).rejects.toThrow(/parts_type_check/)
  })

  it('refuses a Goal without a metric', async () => {
    await expect(
      client.exec(`
        insert into parts (project_id, concept_id, type, record_id, title, status, source)
        values (1, 1, 'goal', 'G2', 'Ship faster', 'open', 'okr')
      `),
    ).rejects.toThrow(/parts_type_fields_check/)
  })

  it('refuses a Goal without a status', async () => {
    await expect(
      client.exec(`
        insert into parts (project_id, concept_id, type, record_id, title, metric, source)
        values (1, 1, 'goal', 'G2', 'Ship faster', 'lead time', 'okr')
      `),
    ).rejects.toThrow(/parts_type_fields_check/)
  })

  it('refuses a Part in a Concept of another Project', async () => {
    await expect(
      client.exec(`
        insert into parts (project_id, concept_id, type, record_id, title)
        values (1, 3, 'entity', 'E1', 'Technique')
      `),
    ).rejects.toThrow(/parts_project_id_concept_id_concepts_project_id_id_fk/)
  })

  it('refuses a Joint from a Part to itself', async () => {
    await expect(
      client.exec(`insert into joints (part_id, needed_part_id) values (2, 2)`),
    ).rejects.toThrow(/joints_parts_differ_check/)
  })

  it('refuses the same pair of Parts twice, in either direction', async () => {
    await expect(
      client.exec(`insert into joints (part_id, needed_part_id) values (3, 1)`),
    ).rejects.toThrow(/joints_pair_unique/)
    await expect(
      client.exec(`insert into joints (part_id, needed_part_id) values (1, 3)`),
    ).rejects.toThrow(/joints_pair_unique/)
  })

  it('refuses a second root Concept in one Project', async () => {
    await expect(
      client.exec(`
        insert into concepts (project_id, parent_id, slug, title)
        values (1, null, 'second-root', 'Second root')
      `),
    ).rejects.toThrow(/concepts_root_unique/)
  })

  it('refuses a Concept nested in a Concept of another Project', async () => {
    await expect(
      client.exec(`
        insert into concepts (project_id, parent_id, slug, title)
        values (2, 1, 'videos', 'Technique videos')
      `),
    ).rejects.toThrow(/concepts_project_id_parent_id_concepts_project_id_id_fk/)
  })

  it('refuses to delete a Part that another Part needs', async () => {
    await expect(
      client.exec(`delete from parts where record_id = 'G1'`),
    ).rejects.toThrow(/joints_needed_part_id_parts_id_fk/)
  })

  it('deletes the Joints of a Part with the Part that needs', async () => {
    await client.exec(`delete from parts where record_id = 'D1'`)

    const joints = await client.query('select id from joints')
    expect(joints.rows).toEqual([])
  })

  it('gives the glue_ci role on each new table the rights it has on projects', async () => {
    const rights = await client.query(`
      select
        has_table_privilege('glue_ci', 'concepts', 'select') as concepts,
        has_table_privilege('glue_ci', 'parts', 'select') as parts,
        has_table_privilege('glue_ci', 'joints', 'select') as joints,
        has_table_privilege('glue_ci', 'measures', 'select') as measures,
        has_table_privilege('glue_ci', 'part_counters', 'select') as part_counters,
        has_table_privilege('glue_ci', 'parts', 'insert') as parts_insert
    `)
    expect(rights.rows).toEqual([
      {
        concepts: true,
        parts: true,
        joints: true,
        measures: true,
        part_counters: true,
        parts_insert: false,
      },
    ])
  })
})
