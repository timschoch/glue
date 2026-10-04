import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ProductNotFoundError } from './record-errors.ts'
import {
  findConcept,
  findInsightIdBySource,
  findRecord,
  listAcceptedDecisions,
  listConceptRecords,
  listGoalsWithMeasure,
  listInsightSources,
  showConceptRecord,
} from './legacy-records.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

afterEach(async () => {
  await client.close()
})

// Project 1 is glue with the root Concept 1. Project 2 is flexibeck with the
// root Concept 2.
// Part 1 is the Goal G1, Part 2 the Insight I1, Part 3 the Guardrail R1,
// Part 4 the Decision D1, Part 5 the Flow F1.
// D1 needs R1, G1 and I1, in this order. F1 needs D1.
async function addParts() {
  await client.exec(`
    insert into projects (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
    insert into concepts (project_id, parent_id, slug, title) values
      (1, null, 'glue', 'Glue'),
      (2, null, 'flexibeck', 'flexibeck');
    insert into parts (project_id, concept_id, type, record_id, title, status, metric, source, body) values
      (1, 1, 'goal', 'G1', 'Ship faster', 'open', 'lead time', 'https://example.com/g1', 'Why the goal exists.');
    insert into parts (project_id, concept_id, type, record_id, title, status, date, source, evidence_level, body) values
      (1, 1, 'insight', 'I1', 'Users churn on slow loads', 'draft', '2026-01-01', 'https://example.com/i1', 'pattern', 'Seen in **three** interviews.');
    insert into parts (project_id, concept_id, type, record_id, title, enforced_by) values
      (1, 1, 'guardrail', 'R1', 'No query over 200ms', 'none yet');
    insert into parts (project_id, concept_id, type, record_id, title, status, date, owner, body) values
      (1, 1, 'decision', 'D1', 'Cache the homepage', 'accepted', '2026-01-02', 'tim', 'Cache reads at the edge.');
    insert into parts (project_id, concept_id, type, record_id, title) values
      (1, 1, 'flow', 'F1', 'Read a cached page');
    insert into joints (part_id, needed_part_id) values (4, 3), (4, 1), (4, 2), (5, 4);
  `)
}

describe('findConcept', () => {
  it('returns the Parts of the Project as the records of today, each Decision with its Goal and its evidence in Joint order', async () => {
    await addParts()

    expect(await findConcept(db, 'glue')).toEqual({
      product: { slug: 'glue', name: 'Glue' },
      goals: [
        {
          id: 'G1',
          title: 'Ship faster',
          metric: 'lead time',
          status: 'open',
          latestValue: null,
        },
      ],
      decisions: [
        {
          id: 'D1',
          title: 'Cache the homepage',
          date: '2026-01-02',
          owner: 'tim',
          status: 'accepted',
          goal: { id: 'G1', title: 'Ship faster' },
          evidence: [
            { id: 'R1', title: 'No query over 200ms' },
            { id: 'I1', title: 'Users churn on slow loads' },
          ],
        },
      ],
      guardrails: [
        { id: 'R1', title: 'No query over 200ms', enforcedBy: 'none yet' },
      ],
      insights: [
        {
          id: 'I1',
          title: 'Users churn on slow loads',
          date: '2026-01-01',
          status: 'draft',
        },
      ],
      facts: [],
    })
  })

  it('sorts records by the number in the id', async () => {
    await addParts()
    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title, enforced_by) values
        (1, 1, 'guardrail', 'R10', 'No secret in logs', 'none yet'),
        (1, 1, 'guardrail', 'R2', 'No Tailwind', 'lint');
    `)

    const concept = await findConcept(db, 'glue')

    expect(concept?.guardrails.map(({ id }) => id)).toEqual(['R1', 'R2', 'R10'])
  })

  it('leaves out the Parts of other Projects', async () => {
    await addParts()

    expect(await findConcept(db, 'flexibeck')).toEqual({
      product: { slug: 'flexibeck', name: 'flexibeck' },
      goals: [],
      decisions: [],
      guardrails: [],
      insights: [],
      facts: [],
    })
  })

  it('returns nothing for a Project that does not exist', async () => {
    await addParts()

    expect(await findConcept(db, 'bakeday')).toBeUndefined()
  })
})

// Adds Part 6, the Decision D2. It needs G1 and R1, and it supersedes D1.
async function addReplacement() {
  await client.exec(`
    insert into parts (project_id, concept_id, type, record_id, title, status, date, owner, body, issue_url) values
      (1, 1, 'decision', 'D2', 'Cache every page', 'accepted', '2026-02-01', 'tim', 'One rule for all pages.', 'https://github.com/timschoch/glue/issues/1');
    insert into joints (part_id, needed_part_id) values (6, 1), (6, 3);
    update parts set status = 'superseded', superseded_by_id = 6 where record_id = 'D1';
  `)
}

describe('findRecord', () => {
  it('returns a Decision with its Goal, its evidence and the Decisions around it', async () => {
    await addParts()
    await addReplacement()

    expect(await findRecord(db, 'glue', 'D1')).toEqual({
      kind: 'decision',
      id: 'D1',
      title: 'Cache the homepage',
      date: '2026-01-02',
      owner: 'tim',
      status: 'superseded',
      body: 'Cache reads at the edge.',
      goal: { id: 'G1', title: 'Ship faster' },
      evidence: [
        { id: 'R1', title: 'No query over 200ms' },
        { id: 'I1', title: 'Users churn on slow loads' },
      ],
      supersededBy: { id: 'D2', title: 'Cache every page' },
      supersedes: [],
      issueUrl: null,
    })
    expect(await findRecord(db, 'glue', 'D2')).toMatchObject({
      supersededBy: null,
      supersedes: [{ id: 'D1', title: 'Cache the homepage' }],
      issueUrl: 'https://github.com/timschoch/glue/issues/1',
    })
  })

  it('returns a Goal without a measure, with the Decisions that need it', async () => {
    await addParts()
    await addReplacement()

    expect(await findRecord(db, 'glue', 'G1')).toEqual({
      kind: 'goal',
      id: 'G1',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'https://example.com/g1',
      measure: null,
      status: 'open',
      baseline: null,
      latestValue: null,
      latestBreakdownValue: null,
      measuredAt: null,
      body: 'Why the goal exists.',
      decisions: [
        { id: 'D1', title: 'Cache the homepage' },
        { id: 'D2', title: 'Cache every page' },
      ],
    })
  })

  it('returns a Goal with its measure and the last readings', async () => {
    await addParts()
    await client.exec(`
      insert into measures (part_id, measure, baseline, latest_value, latest_breakdown_value, measured_at) values
        (1, '{"kind":"mean","source":"mock-analytics","event":"survey","property":"seq","target_change":1,"window_days":7}',
          4.5, 5.25, '1.2.0', '2026-03-01T08:00:00Z');
    `)

    expect(await findRecord(db, 'glue', 'G1')).toMatchObject({
      measure: {
        kind: 'mean',
        source: 'mock-analytics',
        event: 'survey',
        property: 'seq',
        target_change: 1,
        window_days: 7,
      },
      baseline: 4.5,
      latestValue: 5.25,
      latestBreakdownValue: '1.2.0',
      measuredAt: '2026-03-01T08:00:00.000Z',
    })
  })

  it('returns an Insight with the Decisions that need it', async () => {
    await addParts()
    await addReplacement()

    expect(await findRecord(db, 'glue', 'I1')).toEqual({
      kind: 'insight',
      id: 'I1',
      title: 'Users churn on slow loads',
      date: '2026-01-01',
      source: 'https://example.com/i1',
      status: 'draft',
      evidenceLevel: 'pattern',
      body: 'Seen in **three** interviews.',
      decisions: [{ id: 'D1', title: 'Cache the homepage' }],
    })
  })

  it('returns a Guardrail', async () => {
    await addParts()

    expect(await findRecord(db, 'glue', 'R1')).toEqual({
      kind: 'guardrail',
      id: 'R1',
      title: 'No query over 200ms',
      enforcedBy: 'none yet',
      source: null,
      body: '',
    })
  })

  // F1 is a Flow now. F3 was a Fact, and old Fact ids are dropped (D38).
  it.each(['F1', 'F3', 'D9', 'X1', 'D1; drop table parts', ''])(
    'returns nothing for the id "%s"',
    async (recordId) => {
      await addParts()

      expect(await findRecord(db, 'glue', recordId)).toBeUndefined()
    },
  )

  it('returns nothing for a Part of another Project', async () => {
    await addParts()

    expect(await findRecord(db, 'flexibeck', 'D1')).toBeUndefined()
  })
})

const funnel = {
  kind: 'funnel',
  source: 'mock-analytics',
  steps: ['signed-up', 'paid'],
  target: 0.2,
  window_days: 7,
}

// Adds Part 6, the Goal G2 of glue, and Part 7, the Goal G1 of flexibeck.
// Each has a measure. G1 of glue has none.
async function addMeasuredGoals() {
  await client.exec(`
    update projects set analytics_project = 'phc_' || slug;
    insert into parts (project_id, concept_id, type, record_id, title, status, metric, source) values
      (1, 1, 'goal', 'G2', 'More users pay', 'open', 'signup to paid', 'okr'),
      (2, 2, 'goal', 'G1', 'Sell more bread', 'open', 'orders', 'okr');
    insert into measures (part_id, measure, baseline) values
      (6, '${JSON.stringify(funnel)}', null),
      (7, '${JSON.stringify(funnel)}', 4.5);
  `)
}

describe('listGoalsWithMeasure', () => {
  it('lists the open Goals with a measure, each with its Project', async () => {
    await addParts()
    await addMeasuredGoals()

    expect(await listGoalsWithMeasure(db)).toEqual([
      {
        productId: 1,
        productSlug: 'glue',
        analyticsProject: 'phc_glue',
        goalId: 6,
        goalRecordId: 'G2',
        baseline: null,
        measure: funnel,
      },
      {
        productId: 2,
        productSlug: 'flexibeck',
        analyticsProject: 'phc_flexibeck',
        goalId: 7,
        goalRecordId: 'G1',
        baseline: 4.5,
        measure: funnel,
      },
    ])
  })

  it('lists the Goals of one Project', async () => {
    await addParts()
    await addMeasuredGoals()

    const goals = await listGoalsWithMeasure(db, 'flexibeck')

    expect(goals.map(({ goalId }) => goalId)).toEqual([7])
  })

  it('leaves out an achieved Goal', async () => {
    await addParts()
    await addMeasuredGoals()
    await client.exec(`update parts set status = 'achieved' where id = 6`)

    const goals = await listGoalsWithMeasure(db)

    expect(goals.map(({ goalId }) => goalId)).toEqual([7])
  })
})

describe('listAcceptedDecisions', () => {
  it('lists the accepted Decisions that need the Goal', async () => {
    await addParts()
    await addReplacement()

    // D1 is superseded now, the Flow F1 is not a Decision.
    expect(await listAcceptedDecisions(db, 1)).toEqual([
      { id: 'D2', title: 'Cache every page' },
    ])
  })
})

describe('findInsightIdBySource', () => {
  it('returns the id of the Insight of the Project with the source', async () => {
    await addParts()

    expect(await findInsightIdBySource(db, 1, 'https://example.com/i1')).toBe(
      'I1',
    )
  })

  it('returns null for a source of another Project, or of a Part that is not an Insight', async () => {
    await addParts()

    expect(
      await findInsightIdBySource(db, 2, 'https://example.com/i1'),
    ).toBeNull()
    expect(
      await findInsightIdBySource(db, 1, 'https://example.com/g1'),
    ).toBeNull()
  })
})

describe('listInsightSources', () => {
  it('lists the source and the date of each Insight of the Project', async () => {
    await addParts()

    expect(await listInsightSources(db, 'glue')).toEqual([
      { id: 'I1', source: 'https://example.com/i1', date: '2026-01-01' },
    ])
    expect(await listInsightSources(db, 'flexibeck')).toEqual([])
    expect(await listInsightSources(db, 'bakeday')).toEqual([])
  })
})

describe('listConceptRecords', () => {
  it('lists one row per record with id, status and title, folder by folder', async () => {
    await addParts()
    await addReplacement()

    expect(await listConceptRecords(db, 'glue')).toEqual([
      { id: 'G1', status: 'open', title: 'Ship faster' },
      { id: 'D1', status: 'superseded', title: 'Cache the homepage' },
      { id: 'D2', status: 'accepted', title: 'Cache every page' },
      { id: 'I1', status: 'draft', title: 'Users churn on slow loads' },
      { id: 'R1', status: '', title: 'No query over 200ms' },
    ])
  })

  it('lists the records of one folder, sorted by the number in the id', async () => {
    await addParts()
    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title, enforced_by) values
        (1, 1, 'guardrail', 'R10', 'No secret in logs', 'none yet'),
        (1, 1, 'guardrail', 'R2', 'No Tailwind', 'lint');
    `)

    const rows = await listConceptRecords(db, 'glue', 'guardrails')

    expect(rows.map(({ id }) => id)).toEqual(['R1', 'R2', 'R10'])
  })

  // The other reads leave such a Decision out too: the list must not name a
  // record that show cannot find.
  it('leaves out a Decision that needs no Goal', async () => {
    await addParts()
    await client.exec(`
      insert into parts (project_id, concept_id, type, record_id, title, status, date, owner) values
        (1, 1, 'decision', 'D2', 'Cache every page', 'proposed', '2026-02-01', 'tim');
      insert into joints (part_id, needed_part_id) values (6, 2);
    `)

    const rows = await listConceptRecords(db, 'glue', 'decisions')

    expect(rows.map(({ id }) => id)).toEqual(['D1'])
    expect(await findRecord(db, 'glue', 'D2')).toBeUndefined()
  })

  it('lists no Facts: a Fact is no longer a type', async () => {
    await addParts()

    expect(await listConceptRecords(db, 'glue', 'facts')).toEqual([])
  })

  it('says that the Project is missing', async () => {
    await expect(listConceptRecords(db, 'bakeday')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    )
  })
})

describe('showConceptRecord', () => {
  it('shows a Decision with its Goal, its evidence and the Decisions around it', async () => {
    await addParts()
    await addReplacement()

    expect(await showConceptRecord(db, 'glue', 'D1')).toEqual({
      id: 'D1',
      folder: 'decisions',
      fields: {
        title: 'Cache the homepage',
        date: '2026-01-02',
        owner: 'tim',
        status: 'superseded',
      },
      body: 'Cache reads at the edge.',
      goal: { id: 'G1', title: 'Ship faster' },
      evidence: [
        { id: 'R1', title: 'No query over 200ms' },
        { id: 'I1', title: 'Users churn on slow loads' },
      ],
      needs: [],
      supersededBy: 'D2',
      supersedes: [],
    })
    expect(await showConceptRecord(db, 'glue', 'D2')).toMatchObject({
      fields: { issue: 'https://github.com/timschoch/glue/issues/1' },
      supersededBy: undefined,
      supersedes: ['D1'],
    })
  })

  it('shows a Goal with its measure and the last readings', async () => {
    await addParts()
    await addMeasuredGoals()
    await client.exec(`
      update measures set latest_value = 0.25, measured_at = '2026-03-01T08:00:00Z'
      where part_id = 6
    `)

    expect(await showConceptRecord(db, 'glue', 'G2')).toEqual({
      id: 'G2',
      folder: 'goals',
      fields: {
        title: 'More users pay',
        metric: 'signup to paid',
        source: 'okr',
        measure: funnel,
        status: 'open',
        baseline: null,
        latestValue: 0.25,
        latestBreakdownValue: null,
        measuredAt: new Date('2026-03-01T08:00:00Z'),
      },
      body: '',
    })
  })

  it('shows a Goal without a measure', async () => {
    await addParts()

    expect((await showConceptRecord(db, 'glue', 'G1')).fields).toEqual({
      title: 'Ship faster',
      metric: 'lead time',
      source: 'https://example.com/g1',
      measure: null,
      status: 'open',
      baseline: null,
      latestValue: null,
      latestBreakdownValue: null,
      measuredAt: null,
    })
  })

  it('shows an Insight', async () => {
    await addParts()

    expect(await showConceptRecord(db, 'glue', 'I1')).toEqual({
      id: 'I1',
      folder: 'insights',
      fields: {
        title: 'Users churn on slow loads',
        date: '2026-01-01',
        source: 'https://example.com/i1',
        status: 'draft',
        evidenceLevel: 'pattern',
      },
      body: 'Seen in **three** interviews.',
    })
  })

  it('shows a Guardrail', async () => {
    await addParts()

    expect(await showConceptRecord(db, 'glue', 'R1')).toEqual({
      id: 'R1',
      folder: 'guardrails',
      fields: {
        title: 'No query over 200ms',
        enforcedBy: 'none yet',
        source: null,
      },
      body: '',
    })
  })

  // F1 is a Flow now. F3 was a Fact, and old Fact ids are dropped (D38).
  it.each(['F1', 'F3', 'D9'])('throws for the id "%s"', async (id) => {
    await addParts()

    await expect(showConceptRecord(db, 'glue', id)).rejects.toThrow(
      `"${id}" not found`,
    )
  })

  it('throws for an id that is not a Concept id', async () => {
    await addParts()

    await expect(showConceptRecord(db, 'glue', 'X1')).rejects.toThrow(
      '"X1" is not a Concept id',
    )
  })

  it('says that the Project is missing', async () => {
    await expect(showConceptRecord(db, 'bakeday', 'D1')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    )
  })
})
