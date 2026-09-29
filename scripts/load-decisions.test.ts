import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../src/db/schema.ts'
import { importConcept } from '../src/db/import-concept.ts'
import type { ConceptRecord } from '../src/db/import-concept.ts'
import { loadDecisions } from './load-decisions.ts'
import { problems } from './check-pr-workflow.mjs'

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

function decision(data: Record<string, unknown>): ConceptRecord {
  return {
    folder: 'decisions',
    data: {
      title: 'A decision',
      date: '2026-01-02',
      owner: 'tim',
      goal: 'G1',
      evidence: ['I1'],
      ...data,
    },
    body: '',
  }
}

describe('loadDecisions', () => {
  it('reads an accepted Decision from the database', async () => {
    await importConcept(
      db,
      [goal, insight, decision({ id: 'D1', status: 'accepted' })],
      'glue',
    )

    const decisions = await loadDecisions(db, 'glue')

    expect(
      problems({
        body: 'Closes #1\nDecision: D1',
        files: [],
        decisions,
      }),
    ).toEqual([])
  })

  it('reads a superseded Decision, naming its replacement', async () => {
    await importConcept(
      db,
      [
        goal,
        insight,
        decision({ id: 'D1', status: 'superseded', superseded_by: 'D2' }),
        decision({ id: 'D2', status: 'accepted' }),
      ],
      'glue',
    )

    const decisions = await loadDecisions(db, 'glue')

    const [found] = problems({
      body: 'Closes #1\nDecision: D1',
      files: [],
      decisions,
    })
    expect(found).toMatch(/D1/)
    expect(found).toMatch(/D2/)
  })

  it('fails an unknown Decision id', async () => {
    await importConcept(
      db,
      [goal, insight, decision({ id: 'D1', status: 'accepted' })],
      'glue',
    )

    const decisions = await loadDecisions(db, 'glue')

    const [found] = problems({
      body: 'Closes #1\nDecision: D99',
      files: [],
      decisions,
    })
    expect(found).toMatch(/D99/)
  })
})
