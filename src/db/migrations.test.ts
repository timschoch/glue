import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord } from './concept-records.ts'
import { kinds } from './kinds.ts'
import { findRecord } from './legacy-records.ts'
import { addPart } from './part-records.ts'
import { findPart, findProject, listParts } from './parts.ts'
import * as schema from './schema.ts'
import { findProductByToken } from './tokens.ts'

const countersMigration = '0005_record_counters.sql'
const goalStatusMigration = '0006_goal_mean_status.sql'
const projectsMigration = '0009_projects.sql'
const partTablesMigration = '0010_part_tables.sql'
const cutoverMigration = '0011_part_model_cutover.sql'
const trustMigration = '0013_trust_and_work_state.sql'

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

// Builds the start state of a group of tests one time. Each test of the
// group gets its own copy of it, which is faster than building it again.
function setStartState(build: () => Promise<void>) {
  let startState: File | Blob

  beforeAll(async () => {
    client = new PGlite()
    await build()
    // Without the checkpoint, each sequence of the copy skips 32 numbers.
    await client.exec('checkpoint')
    startState = await client.dumpDataDir('none')
    await client.close()
  })

  beforeEach(() => {
    client = new PGlite({ loadDataDir: startState })
  })
}

afterEach(async () => {
  await client.close()
})

describe('the migration that adds the record counters', () => {
  setStartState(() => runMigrationsBefore(countersMigration))

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
      insert into insights (product_id, record_id, title, date, source) values
        (1, 'I2', 'An export is one request', '2026-09-01', 'API contract');
    `)

    await runMigration(countersMigration)
    await runMigrationsAfter(countersMigration)

    const id = await addConceptRecord(
      drizzle(client, { schema }),
      'glue',
      'insights',
      { title: 'CI takes ten minutes', source: 'verify ci' },
      '',
    )
    expect(id).toBe('I3')
  })
})

describe('the migration that adds the Goal status and the mean measure', () => {
  setStartState(() => runMigrationsBefore(goalStatusMigration))

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

  setStartState(async () => {
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
  setStartState(async () => {
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
    // A later migration adds a column to `joints`, so the test names the
    // columns of this one.
    await client.exec(
      `insert into joints (part_id, needed_part_id) values (3, 2)`,
    )
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
      .select({
        id: schema.joints.id,
        partId: schema.joints.partId,
        neededPartId: schema.joints.neededPartId,
        twoWay: schema.joints.twoWay,
      })
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

describe('the migration that copies the records into the Part model', () => {
  // Project 1 is glue, Project 2 is flexibeck.
  // glue: the Facts F10, F2 and F1 have the row ids 1, 2 and 3. D35 makes F2
  // a Guardrail. The Insight counter is at 5, above the highest id I2.
  // The Decision D2 superseded D1 and has the evidence F2, I1, F10, I2, F1.
  // flexibeck: D35 makes F2 a Guardrail and F10 a Hunch.
  setStartState(async () => {
    await runMigrationsBefore(cutoverMigration)
    await client.exec(`
      insert into projects (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
      insert into goals (product_id, record_id, title, metric, source, status, measure, baseline, latest_value, latest_breakdown_value, measured_at, body) values
        (1, 'G1', 'More users pay', 'signup to paid', 'okr', 'open',
          '{"kind":"funnel","source":"mock-analytics","steps":["signed-up","paid"],"target":0.2,"window_days":7}',
          4.2, 5.1, 'v2', '2026-10-02T06:00:00Z', ''),
        (1, 'G2', 'Ship faster', 'lead time', 'okr', 'achieved', null, null, null, null, null, ''),
        (2, 'G1', 'Plans fit the day', 'plans accepted', 'vision', 'open', null, null, null, null, null, 'Stay within F2.');
      insert into insights (product_id, record_id, title, date, source, status, body) values
        (1, 'I1', 'Bakers want step videos', '2026-09-01', 'interview', null, ''),
        (1, 'I2', 'The build failed on a type error', '2026-09-02', 'verify ci', 'draft', 'See F2 and F10, not PDF2 or F100.');
      insert into facts (product_id, record_id, title, source, body) values
        (1, 'F10', 'Glue has its Concept in a database', 'README', 'Since ring 1.'),
        (1, 'F2', 'Findings go back as Insights', 'CLAUDE.md', ''),
        (1, 'F1', 'Files in the repo are fine', 'ring 0', ''),
        (2, 'F2', 'AI only structures input', 'vision', ''),
        (2, 'F3', 'A recipe is a tree of steps', 'vision', ''),
        (2, 'F10', 'Home bakers with jobs', 'vision', '');
      insert into guardrails (product_id, record_id, title, enforced_by, body) values
        (1, 'R1', 'Budget 0', 'the Owner', '');
      insert into decisions (product_id, record_id, title, date, owner, status, goal_id, body, issue_url) values
        (1, 'D1', 'Show a photo', '2026-09-03', 'Tim', 'superseded', 1, '', null),
        (1, 'D2', 'Show the video of the creator', '2026-09-04', 'Tim', 'accepted', 1,
          'Builds on F1, F2 and F10.', 'https://github.com/timschoch/glue/issues/7'),
        (2, 'D1', 'Plan from the finish time', '2026-09-05', 'Ada', 'proposed', 3, '', null);
      update decisions set superseded_by_id = 2 where id = 1;
      insert into decision_evidence (decision_id, insight_id, fact_id) values
        (1, 1, null),
        (2, null, 2),
        (2, 1, null),
        (2, null, 1),
        (2, 2, null),
        (2, null, 3),
        (3, null, 6),
        (3, null, 5);
      insert into record_counters (product_id, folder, last_number) values
        (1, 'insights', 5),
        (1, 'decisions', 1),
        (1, 'facts', 10),
        (2, 'facts', 10);
    `)
    await runMigration(cutoverMigration)
  })

  const today = () => new Date().toISOString().slice(0, 10)

  it('gives each Project one root Concept that holds its Parts', async () => {
    const db = drizzle(client, { schema })

    expect(await findProject(db, 'glue')).toEqual({
      slug: 'glue',
      name: 'Glue',
      concept: {
        slug: 'glue',
        title: 'Glue',
        kind: null,
        partCount: 10,
        concepts: [],
      },
    })
    expect((await findProject(db, 'flexibeck'))?.concept.partCount).toBe(5)
  })

  it('keeps each record id, and gives each Fact the next id of its new type in Fact number order', async () => {
    await runMigrationsAfter(cutoverMigration)
    const db = drizzle(client, { schema })

    const glue = await listParts(db, 'glue')
    expect(glue.map(({ id, type, status }) => [id, type, status])).toEqual([
      ['I1', 'insight', null],
      ['I2', 'insight', 'draft'],
      ['I6', 'insight', null],
      ['I7', 'insight', null],
      ['G1', 'goal', 'open'],
      ['G2', 'goal', 'achieved'],
      ['D1', 'decision', 'superseded'],
      ['D2', 'decision', 'accepted'],
      ['R1', 'guardrail', null],
      ['R2', 'guardrail', null],
    ])
    const flexibeck = await listParts(db, 'flexibeck')
    expect(flexibeck.map(({ id, title }) => [id, title])).toEqual([
      ['I1', 'A recipe is a tree of steps'],
      ['I2', 'Home bakers with jobs'],
      ['G1', 'Plans fit the day'],
      ['D1', 'Plan from the finish time'],
      ['R1', 'AI only structures input'],
    ])
  })

  it('turns a Fact into a Confirmed Insight with its source and body', async () => {
    await runMigrationsAfter(cutoverMigration)
    const db = drizzle(client, { schema })

    expect(await findPart(db, 'glue', 'I7')).toMatchObject({
      type: 'insight',
      title: 'Glue has its Concept in a database',
      status: null,
      source: 'README',
      body: 'Since ring 1.',
      date: today(),
      evidenceLevel: 'confirmed',
    })
    expect(await findPart(db, 'glue', 'I6')).toMatchObject({
      title: 'Files in the repo are fine',
      evidenceLevel: 'confirmed',
    })
  })

  it('turns a Fact of the list of D35 into a Guardrail or a Hunch', async () => {
    await runMigrationsAfter(cutoverMigration)
    const db = drizzle(client, { schema })

    expect(await findPart(db, 'glue', 'R2')).toMatchObject({
      type: 'guardrail',
      title: 'Findings go back as Insights',
      status: null,
      source: 'CLAUDE.md',
      enforcedBy: 'the merge gate and pnpm collect-insights',
      evidenceLevel: null,
    })
    expect(await findPart(db, 'flexibeck', 'R1')).toMatchObject({
      type: 'guardrail',
      enforcedBy: 'not enforced yet',
    })
    expect(await findPart(db, 'flexibeck', 'I2')).toMatchObject({
      type: 'insight',
      evidenceLevel: 'hunch',
    })
    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      date: '2026-09-01',
      evidenceLevel: null,
    })
  })

  it('glues each Decision to its Goal and to its evidence in the old order', async () => {
    await runMigrationsAfter(cutoverMigration)
    const db = drizzle(client, { schema })

    const decision = await findPart(db, 'glue', 'D2')
    expect(decision?.needs.map(({ part }) => part.id)).toEqual([
      'G1',
      'R2',
      'I1',
      'I7',
      'I2',
      'I6',
    ])
    expect(await findRecord(db, 'glue', 'D2')).toMatchObject({
      date: '2026-09-04',
      owner: 'Tim',
      status: 'accepted',
      issueUrl: 'https://github.com/timschoch/glue/issues/7',
      goal: { id: 'G1', title: 'More users pay' },
      evidence: [
        { id: 'R2', title: 'Findings go back as Insights' },
        { id: 'I1', title: 'Bakers want step videos' },
        { id: 'I7', title: 'Glue has its Concept in a database' },
        { id: 'I2', title: 'The build failed on a type error' },
        { id: 'I6', title: 'Files in the repo are fine' },
      ],
    })
    expect(await findRecord(db, 'flexibeck', 'D1')).toMatchObject({
      goal: { id: 'G1', title: 'Plans fit the day' },
      evidence: [
        { id: 'I2', title: 'Home bakers with jobs' },
        { id: 'I1', title: 'A recipe is a tree of steps' },
      ],
    })
  })

  it('keeps the Decision that superseded a Decision', async () => {
    const db = drizzle(client, { schema })

    expect(await findRecord(db, 'glue', 'D1')).toMatchObject({
      status: 'superseded',
      supersededBy: { id: 'D2', title: 'Show the video of the creator' },
      evidence: [{ id: 'I1', title: 'Bakers want step videos' }],
    })
    expect(await findRecord(db, 'glue', 'D2')).toMatchObject({
      supersededBy: null,
      supersedes: [{ id: 'D1', title: 'Show a photo' }],
    })
  })

  it('moves the measure and the readings of a Goal', async () => {
    const db = drizzle(client, { schema })

    expect(await findRecord(db, 'glue', 'G1')).toMatchObject({
      metric: 'signup to paid',
      source: 'okr',
      status: 'open',
      measure: {
        kind: 'funnel',
        source: 'mock-analytics',
        steps: ['signed-up', 'paid'],
        target: 0.2,
        window_days: 7,
      },
      baseline: 4.2,
      latestValue: 5.1,
      latestBreakdownValue: 'v2',
      measuredAt: '2026-10-02T06:00:00.000Z',
    })
    expect(await findRecord(db, 'glue', 'G2')).toMatchObject({
      status: 'achieved',
      measure: null,
      measuredAt: null,
    })
  })

  it('rewrites each old Fact id in a body to the new id in its Project', async () => {
    await runMigrationsAfter(cutoverMigration)
    const db = drizzle(client, { schema })

    expect((await findPart(db, 'glue', 'D2'))?.body).toBe(
      'Builds on I6, R2 and I7.',
    )
    expect((await findPart(db, 'glue', 'I2'))?.body).toBe(
      'See R2 and I7, not PDF2 or F100.',
    )
    expect((await findPart(db, 'flexibeck', 'G1'))?.body).toBe(
      'Stay within R1.',
    )
  })

  it('starts each counter at the highest number that its type had', async () => {
    await runMigrationsAfter(cutoverMigration)
    const db = drizzle(client, { schema })

    const insight = await addPart(db, 'glue', {
      type: 'insight',
      title: 'Bakers skip the long text',
      source: 'interview',
    })
    const guardrail = await addPart(db, 'glue', {
      type: 'guardrail',
      title: 'Only the videos of the creator',
      enforcedBy: 'review',
    })
    const decision = await addPart(db, 'glue', {
      type: 'decision',
      title: 'Show the steps as a list',
      owner: 'Tim',
      status: 'proposed',
      needs: ['G1', 'I1'],
    })
    const goal = await addPart(db, 'flexibeck', {
      type: 'goal',
      title: 'Bakers come back',
      metric: 'second plan',
      source: 'vision',
    })
    const flow = await addPart(db, 'glue', {
      type: 'flow',
      title: 'Watch a technique while baking',
    })

    expect([insight, guardrail, decision, goal, flow]).toEqual([
      'I8',
      'R3',
      'D3',
      'G2',
      'F1',
    ])
  })

  it.each([
    `insert into goals (product_id, record_id, title, metric, source) values (1, 'G3', 'Fewer errors', 'error rate', 'okr')`,
    `update decisions set status = 'accepted' where record_id = 'D1'`,
    `delete from insights where record_id = 'I2'`,
    `insert into facts (product_id, record_id, title, source) values (1, 'F11', 'CI takes ten minutes', 'verify ci')`,
    `update guardrails set title = 'Budget 5'`,
    `delete from decision_evidence`,
    `update record_counters set last_number = last_number + 1`,
  ])('refuses the write to an old table: %s', async (write) => {
    await expect(client.exec(write)).rejects.toThrow(
      /is read-only: the Part model holds the records now/,
    )
  })

  it('still lets the code from before the migration read the old tables', async () => {
    const counts = await client.query(`
      select
        (select count(*)::integer from goals) as goals,
        (select count(*)::integer from decisions) as decisions,
        (select count(*)::integer from insights) as insights,
        (select count(*)::integer from facts) as facts,
        (select count(*)::integer from guardrails) as guardrails,
        (select count(*)::integer from decision_evidence) as decision_evidence,
        (select count(*)::integer from products) as products
    `)
    expect(counts.rows).toEqual([
      {
        goals: 3,
        decisions: 3,
        insights: 2,
        facts: 6,
        guardrails: 1,
        decision_evidence: 8,
        products: 2,
      },
    ])
  })

  // The label of each row that the rehearsal checks return.
  async function rehearse() {
    const checks = await client.exec(
      await readFile('./scripts/rehearse-cutover.sql', 'utf8'),
    )
    expect(checks).toHaveLength(5)
    return checks.flatMap(({ rows }) =>
      rows.map((row) => (row as { label: string }).label),
    )
  }

  it('passes each check of the rehearsal', async () => {
    expect(await rehearse()).toEqual([])
  })

  it('fails the check of the rehearsal for each thing that is wrong', async () => {
    // The Joints 2 and 3 of glue: D2 needs G1, D2 needs R2.
    await client.exec(`
      delete from parts where project_id = 1 and record_id = 'R1';
      delete from joints where id in (2, 3);
      update parts set body = 'See F10.' where project_id = 1 and record_id = 'G2';
      update part_counters set last_number = 1 where project_id = 1 and type = 'insight';
    `)

    expect(await rehearse()).toEqual([
      'the row count of a type differs',
      'a Decision has no Joint to its Goal',
      'the evidence of a Decision differs',
      'a body names the old id of a Fact',
      'a counter is below the highest number of its type',
    ])
  })

  it('refuses a record id that is not one letter and a number', async () => {
    const other = new PGlite()
    try {
      for (const file of await listMigrations()) {
        if (file < cutoverMigration)
          await other.exec(await readFile(`./drizzle/${file}`, 'utf8'))
      }
      await other.exec(`
        insert into projects (slug, name) values ('glue', 'Glue');
        insert into guardrails (product_id, record_id, title, enforced_by) values
          (1, 'R-1', 'Budget 0', 'the Owner');
      `)

      await expect(
        other.exec(await readFile(`./drizzle/${cutoverMigration}`, 'utf8')),
      ).rejects.toThrow(/record id "R-1"/)
    } finally {
      await other.close()
    }
  })
})

describe('the migration that adds Trust and the Work state', () => {
  setStartState(async () => {
    await runMigrationsBefore(trustMigration)
    await client.exec(`
      insert into projects (slug, name) values ('glue', 'Glue');
      insert into concepts (project_id, slug, title) values (1, 'glue', 'Glue');
      insert into parts (project_id, concept_id, type, record_id, title, status, metric, source) values
        (1, 1, 'goal', 'G1', 'More users pay', 'open', 'signup to paid', 'okr');
      insert into parts (project_id, concept_id, type, record_id, title, status, date, source) values
        (1, 1, 'insight', 'I1', 'Bakers want step videos', null, '2026-10-01', 'interview'),
        (1, 1, 'insight', 'I2', 'Bakers skip the text', 'draft', '2026-10-01', 'measure');
      insert into parts (project_id, concept_id, type, record_id, title, status, date, owner) values
        (1, 1, 'decision', 'D1', 'Show a video', 'superseded', '2026-10-02', 'Tim'),
        (1, 1, 'decision', 'D2', 'Show the video of the baker', 'accepted', '2026-10-03', 'Tim'),
        (1, 1, 'decision', 'D3', 'Show two videos', 'proposed', '2026-10-03', 'Tim');
      insert into parts (project_id, concept_id, type, record_id, title) values
        (1, 1, 'entity', 'E1', 'Technique');
    `)
  })

  function listStates() {
    return client.query(
      'select record_id, trust, work_state from parts order by id',
    )
  }

  it('reads the Trust and the Work state of each Part from its status', async () => {
    await runMigration(trustMigration)

    expect((await listStates()).rows).toEqual([
      { record_id: 'G1', trust: 'solid', work_state: 'published' },
      { record_id: 'I1', trust: 'solid', work_state: 'published' },
      { record_id: 'I2', trust: 'not-ready', work_state: 'draft' },
      { record_id: 'D1', trust: 'wrong', work_state: 'sunk' },
      { record_id: 'D2', trust: 'solid', work_state: 'published' },
      { record_id: 'D3', trust: 'not-ready', work_state: 'review' },
      { record_id: 'E1', trust: 'solid', work_state: 'published' },
    ])
  })

  it('marks each published Part as published before', async () => {
    await runMigration(trustMigration)

    const marked = await client.query<{ record_id: string }>(
      'select record_id from parts where published_at is not null order by id',
    )
    expect(marked.rows.map((row) => row.record_id)).toEqual([
      'G1',
      'I1',
      'D2',
      'E1',
    ])
  })

  it('takes a Part from the code from before the migration', async () => {
    await runMigration(trustMigration)

    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title) values
        (1, 1, 'flow', 'F1', 'Watch a technique');
    `)

    expect((await listStates()).rows.at(-1)).toEqual({
      record_id: 'F1',
      trust: 'not-ready',
      work_state: 'draft',
    })
  })
})
