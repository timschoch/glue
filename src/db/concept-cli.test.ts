import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  addConceptRecord,
  listConceptRecords,
  setDecisionStatus,
  showConceptRecord,
} from './concept-cli.ts'
import type { ConceptRecord } from './import-concept.ts'
import { importConcept } from './import-concept.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const goal: ConceptRecord = {
  folder: 'goals',
  data: {
    id: 'G1',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'https://example.com/g1',
  },
  body: '',
}

const insight: ConceptRecord = {
  folder: 'insights',
  data: {
    id: 'I1',
    title: 'Users churn on slow loads',
    date: '2026-01-01',
    source: 'https://example.com/i1',
  },
  body: '',
}

const fact: ConceptRecord = {
  folder: 'facts',
  data: {
    id: 'F1',
    title: 'p95 load time is 3s',
    source: 'https://example.com/f1',
  },
  body: '',
}

const decision: ConceptRecord = {
  folder: 'decisions',
  data: {
    id: 'D1',
    title: 'Cache the homepage',
    date: '2026-01-02',
    owner: 'tim',
    status: 'accepted',
    goal: 'G1',
    evidence: ['I1', 'F1'],
  },
  body: 'Cache reads at the edge.',
}

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await importConcept(db, [goal, insight, fact, decision], 'glue')
})

afterEach(async () => {
  await client.close()
})

describe('listConceptRecords', () => {
  it('lists one row per record with id, status and title', async () => {
    const rows = await listConceptRecords(db, 'glue', 'decisions')
    expect(rows).toEqual([
      { id: 'D1', status: 'accepted', title: 'Cache the homepage' },
    ])
  })

  it('lists every folder when none is given', async () => {
    const rows = await listConceptRecords(db, 'glue')
    expect(rows.map((row) => row.id).sort()).toEqual(['D1', 'F1', 'G1', 'I1'])
  })
})

describe('showConceptRecord', () => {
  it('shows a Decision with its Goal and evidence titles', async () => {
    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.title).toBe('Cache the homepage')
    expect(record.body).toBe('Cache reads at the edge.')
    expect(record.goal).toEqual({ id: 'G1', title: 'Ship faster' })
    expect(record.evidence).toEqual(
      expect.arrayContaining([
        { id: 'I1', title: 'Users churn on slow loads' },
        { id: 'F1', title: 'p95 load time is 3s' },
      ]),
    )
  })

  it('shows a non-Decision record', async () => {
    const record = await showConceptRecord(db, 'glue', 'G1')
    expect(record.fields.title).toBe('Ship faster')
    expect(record.goal).toBeUndefined()
  })

  it('throws when the id does not exist', async () => {
    await expect(showConceptRecord(db, 'glue', 'D9')).rejects.toThrow(
      /"D9" not found/,
    )
  })
})

describe('addConceptRecord', () => {
  it('defaults date to today (UTC) for an Insight without one', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'insights',
      {
        title: 'Users bounce on the pricing page',
        source: 'https://example.com/i2',
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.fields.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps a given date for an Insight instead of defaulting', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'insights',
      {
        title: 'Users bounce on the pricing page',
        source: 'https://example.com/i2',
        date: '2020-01-01',
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.fields.date).toBe('2020-01-01')
  })

  it('inserts with the next free id and returns it', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'guardrails',
      { title: 'No query over 200ms', enforced_by: 'none yet' },
      '',
    )
    expect(id).toBe('R1')

    const secondId = await addConceptRecord(
      db,
      'glue',
      'guardrails',
      { title: 'No secret in logs', enforced_by: 'none yet' },
      '',
    )
    expect(secondId).toBe('R2')
  })

  it('rejects a missing required field and writes nothing', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'guardrails',
        { title: 'No title check' },
        '',
      ),
    ).rejects.toThrow(/"enforced_by" is required/)

    const rows = await listConceptRecords(db, 'glue', 'guardrails')
    expect(rows).toHaveLength(0)
  })

  it('rejects a Decision whose goal does not exist and writes nothing', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        {
          title: 'Bad decision',
          date: '2026-01-03',
          owner: 'tim',
          status: 'accepted',
          goal: 'G9',
          evidence: ['I1'],
        },
        '',
      ),
    ).rejects.toThrow(/goal "G9" not found/)

    const rows = await listConceptRecords(db, 'glue', 'decisions')
    expect(rows).toHaveLength(1)
  })

  it('rejects a superseded Decision without superseded_by', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        {
          title: 'Old decision',
          date: '2026-01-03',
          owner: 'tim',
          status: 'superseded',
          goal: 'G1',
          evidence: ['I1'],
        },
        '',
      ),
    ).rejects.toThrow(/superseded Decision needs "superseded_by"/)
  })

  it('resolves goal and evidence to a Decision that show can read back', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Second decision',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1', 'F1'],
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.goal).toEqual({ id: 'G1', title: 'Ship faster' })
    expect(record.evidence).toHaveLength(2)
  })
})

describe('setDecisionStatus', () => {
  it('changes a Decision status', async () => {
    await setDecisionStatus(db, 'glue', 'D1', 'proposed')

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('proposed')
  })

  it('rejects superseded without superseded_by', async () => {
    await expect(
      setDecisionStatus(db, 'glue', 'D1', 'superseded'),
    ).rejects.toThrow(/superseded Decision needs "superseded_by"/)

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('accepted')
  })

  it('sets superseded_by when given', async () => {
    const secondId = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Second decision',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1'],
      },
      '',
    )

    await setDecisionStatus(db, 'glue', 'D1', 'superseded', secondId)

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('superseded')
    expect(record.supersededBy).toBe(secondId)
  })
})
