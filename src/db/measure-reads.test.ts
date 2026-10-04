import { describe, expect, it } from 'vitest'

import {
  findInsightIdBySource,
  listAcceptedDecisions,
  listGoalsWithMeasure,
  listInsightSources,
} from './measure-reads.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { client, db } = createTestDatabase(schema)

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

// Adds Part 6, the Decision D2. It needs G1 and R1, and it supersedes D1.
async function addReplacement() {
  await client.exec(`
    insert into parts (project_id, concept_id, type, record_id, title, status, date, owner, body, issue_url) values
      (1, 1, 'decision', 'D2', 'Cache every page', 'accepted', '2026-02-01', 'tim', 'One rule for all pages.', 'https://github.com/timschoch/glue/issues/1');
    insert into joints (part_id, needed_part_id) values (6, 1), (6, 3);
    update parts set status = 'superseded', superseded_by_id = 6 where record_id = 'D1';
  `)
}

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
        type: 'goal',
        baseline: null,
        measure: funnel,
      },
      {
        productId: 2,
        productSlug: 'flexibeck',
        analyticsProject: 'phc_flexibeck',
        goalId: 7,
        goalRecordId: 'G1',
        type: 'goal',
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
