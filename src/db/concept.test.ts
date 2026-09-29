import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord, setDecisionStatus } from './concept-cli.ts'
import { findConcept, findRecord } from './concept.ts'
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

const goal = {
  title: 'Ship faster',
  metric: 'lead time',
  source: 'https://example.com/g1',
}

const decision = {
  title: 'Cache the homepage',
  date: '2026-01-02',
  owner: 'tim',
  status: 'accepted',
  goal: 'G1',
  evidence: ['I1', 'F1'],
}

// Adds G1, I1, F1, R1 and D1 to the Product.
async function addRecords(productSlug = 'glue') {
  await addConceptRecord(db, productSlug, 'goals', goal, 'Why the goal exists.')
  await addConceptRecord(
    db,
    productSlug,
    'insights',
    {
      title: 'Users churn on slow loads',
      date: '2026-01-01',
      source: 'https://example.com/i1',
      status: 'draft',
    },
    'Seen in **three** interviews.',
  )
  await addConceptRecord(
    db,
    productSlug,
    'facts',
    { title: 'p95 load time is 3s', source: 'https://example.com/f1' },
    '',
  )
  await addConceptRecord(
    db,
    productSlug,
    'guardrails',
    { title: 'No query over 200ms', enforced_by: 'none yet' },
    '',
  )
  await addConceptRecord(
    db,
    productSlug,
    'decisions',
    decision,
    'Cache reads at the edge.',
  )
}

// Adds D2, a second Decision for G1 that cites F1.
async function addReplacement() {
  await addConceptRecord(
    db,
    'glue',
    'decisions',
    {
      title: 'Cache every page',
      date: '2026-02-01',
      owner: 'tim',
      status: 'proposed',
      goal: 'G1',
      evidence: ['F1'],
    },
    'One rule for all pages.',
  )
}

describe('findConcept', () => {
  it('returns the records of the Product, each Decision with its Goal and evidence', async () => {
    await addRecords()

    expect(await findConcept(db, 'glue')).toEqual({
      product: { slug: 'glue', name: 'glue' },
      goals: [{ id: 'G1', title: 'Ship faster', metric: 'lead time' }],
      decisions: [
        {
          id: 'D1',
          title: 'Cache the homepage',
          date: '2026-01-02',
          owner: 'tim',
          status: 'accepted',
          goal: { id: 'G1', title: 'Ship faster' },
          evidence: [
            { id: 'I1', title: 'Users churn on slow loads' },
            { id: 'F1', title: 'p95 load time is 3s' },
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
      facts: [{ id: 'F1', title: 'p95 load time is 3s' }],
    })
  })

  it('sorts records by the number in the id', async () => {
    await addRecords()
    // Nine more Decisions: D2 to D10.
    for (let added = 0; added < 9; added++)
      await addConceptRecord(db, 'glue', 'decisions', decision, '')

    const concept = await findConcept(db, 'glue')

    expect(concept?.decisions.map(({ id }) => id)).toEqual([
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'D8',
      'D9',
      'D10',
    ])
  })

  it('leaves out the records of other Products', async () => {
    await addRecords()
    await addConceptRecord(
      db,
      'flexibeck',
      'goals',
      { ...goal, title: 'Sell more bread' },
      '',
    )

    const concept = await findConcept(db, 'flexibeck')

    expect(concept).toEqual({
      product: { slug: 'flexibeck', name: 'flexibeck' },
      goals: [{ id: 'G1', title: 'Sell more bread', metric: 'lead time' }],
      decisions: [],
      guardrails: [],
      insights: [],
      facts: [],
    })
  })

  it('returns nothing for a Product that does not exist', async () => {
    await addRecords()

    expect(await findConcept(db, 'flexibeck')).toBeUndefined()
  })
})

describe('findRecord', () => {
  it('returns a Decision with its Goal, its evidence and the Decisions around it', async () => {
    await addRecords()
    await addReplacement()
    await setDecisionStatus(db, 'glue', 'D1', 'superseded', 'D2')

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
        { id: 'I1', title: 'Users churn on slow loads' },
        { id: 'F1', title: 'p95 load time is 3s' },
      ],
      supersededBy: { id: 'D2', title: 'Cache every page' },
      supersedes: [],
    })
    expect(await findRecord(db, 'glue', 'D2')).toMatchObject({
      supersededBy: null,
      supersedes: [{ id: 'D1', title: 'Cache the homepage' }],
    })
  })

  it('returns a Goal with the Decisions that serve it', async () => {
    await addRecords()
    await addReplacement()

    expect(await findRecord(db, 'glue', 'G1')).toEqual({
      kind: 'goal',
      id: 'G1',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'https://example.com/g1',
      body: 'Why the goal exists.',
      decisions: [
        { id: 'D1', title: 'Cache the homepage' },
        { id: 'D2', title: 'Cache every page' },
      ],
    })
  })

  it('returns an Insight with the Decisions that cite it', async () => {
    await addRecords()
    await addReplacement()

    expect(await findRecord(db, 'glue', 'I1')).toEqual({
      kind: 'insight',
      id: 'I1',
      title: 'Users churn on slow loads',
      date: '2026-01-01',
      source: 'https://example.com/i1',
      status: 'draft',
      body: 'Seen in **three** interviews.',
      decisions: [{ id: 'D1', title: 'Cache the homepage' }],
    })
  })

  it('returns a Fact with the Decisions that cite it', async () => {
    await addRecords()
    await addReplacement()

    expect(await findRecord(db, 'glue', 'F1')).toEqual({
      kind: 'fact',
      id: 'F1',
      title: 'p95 load time is 3s',
      source: 'https://example.com/f1',
      body: '',
      decisions: [
        { id: 'D1', title: 'Cache the homepage' },
        { id: 'D2', title: 'Cache every page' },
      ],
    })
  })

  it('returns a Guardrail', async () => {
    await addRecords()

    expect(await findRecord(db, 'glue', 'R1')).toEqual({
      kind: 'guardrail',
      id: 'R1',
      title: 'No query over 200ms',
      enforcedBy: 'none yet',
      body: '',
    })
  })

  it.each(['D9', 'X1', 'D1; drop table decisions', ''])(
    'returns nothing for the id "%s"',
    async (recordId) => {
      await addRecords()

      expect(await findRecord(db, 'glue', recordId)).toBeUndefined()
    },
  )

  it('returns nothing for a record of another Product', async () => {
    await addRecords()
    await addConceptRecord(db, 'flexibeck', 'goals', goal, '')

    expect(await findRecord(db, 'flexibeck', 'D1')).toBeUndefined()
  })
})
