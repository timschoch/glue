import { beforeEach, describe, expect, it } from 'vitest'

import { listLeveledParts } from './flight-level.ts'
import { assign, joinProject, setLoopSteps } from './members.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { client, db } = createTestDatabase(schema)

const tim = { id: 'user-tim', name: 'Tim', email: 'tim@example.com' }

// The Project glue has the root Concept glue and the Concept people in it.
// I1 and R1 are in the root, D1 and R2 are in people. Tim is a member of
// glue with no loop step.
beforeEach(async () => {
  await client.exec(`
    insert into projects (slug, name) values ('glue', 'Glue');
    insert into concepts (project_id, parent_id, slug, title) values
      (1, null, 'glue', 'Glue'),
      (1, 1, 'people', 'People');
    insert into parts (project_id, concept_id, type, record_id, title, status, date, owner) values
      (1, 2, 'decision', 'D1', 'A Project has members', 'proposed', '2026-10-01', 'Tim');
    insert into parts (project_id, concept_id, type, record_id, title, date, source, evidence_level) values
      (1, 1, 'insight', 'I1', 'Open sign-up', '2026-10-03', 'review', 'pattern');
    insert into parts (project_id, concept_id, type, record_id, title, enforced_by) values
      (1, 1, 'guardrail', 'R1', 'No cohorts', 'none yet'),
      (1, 2, 'guardrail', 'R2', 'No data is hidden', 'none yet');
  `)
  await joinProject(db, 'glue', tim)
})

async function levels(member?: string, types?: schema.PartType[]) {
  const parts = await listLeveledParts(db, 'glue', member, types)
  return parts.map(({ id, flightLevel }) => [id, flightLevel])
}

describe('the flight level of a Part', () => {
  it('is Strategic for a member with no loop step and no assignment', async () => {
    expect(await levels(tim.email)).toEqual([
      ['I1', 'strategic'],
      ['D1', 'strategic'],
      ['R1', 'strategic'],
      ['R2', 'strategic'],
    ])
  })

  it('is Operational when the section of the Part is a loop step of the member', async () => {
    await setLoopSteps(db, 'glue', 1, ['understand', 'build'])

    expect(await levels(tim.email)).toEqual([
      ['I1', 'operational'],
      ['D1', 'strategic'],
      ['R1', 'operational'],
      ['R2', 'operational'],
    ])
  })

  it('is Operational when the member is Responsible or Co-Author of the Part', async () => {
    await assign(db, 'glue', {
      member: tim.email,
      role: 'responsible',
      part: 'D1',
    })
    await assign(db, 'glue', {
      member: tim.email,
      role: 'co-author',
      part: 'R1',
    })

    expect(await levels(tim.email)).toEqual([
      ['I1', 'strategic'],
      ['D1', 'operational'],
      ['R1', 'operational'],
      ['R2', 'strategic'],
    ])
  })

  it('is Operational when the member is Responsible or Co-Author of its home Concept', async () => {
    await assign(db, 'glue', {
      member: tim.email,
      role: 'co-author',
      concept: 'people',
    })

    expect(await levels(tim.email)).toEqual([
      ['I1', 'strategic'],
      ['D1', 'operational'],
      ['R1', 'strategic'],
      ['R2', 'operational'],
    ])
  })

  it('is Strategic for another member, and for a person who is no member', async () => {
    await joinProject(db, 'glue', {
      id: 'user-ada',
      name: 'Ada',
      email: 'ada@example.com',
    })
    await setLoopSteps(db, 'glue', 1, ['build'])
    await assign(db, 'glue', {
      member: tim.email,
      role: 'responsible',
      part: 'D1',
    })

    expect(await levels('Ada@example.com', ['decision', 'guardrail'])).toEqual([
      ['D1', 'strategic'],
      ['R1', 'strategic'],
      ['R2', 'strategic'],
    ])
    expect(await levels(undefined, ['decision'])).toEqual([['D1', 'strategic']])
    expect(await levels('nobody@example.com', ['decision'])).toEqual([
      ['D1', 'strategic'],
    ])
  })
})
