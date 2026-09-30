import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../src/db/schema.ts'
import {
  addConceptRecord,
  setDecisionStatus,
} from '../src/db/concept-records.ts'
import { loadDecisions } from './load-decisions.ts'
import { problems } from './check-pr-workflow.mjs'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await addConceptRecord(
    db,
    'glue',
    'goals',
    {
      title: 'Ship faster',
      metric: 'lead time',
      source: 'https://example.com/g1',
    },
    '',
  )
  await addConceptRecord(
    db,
    'glue',
    'insights',
    {
      title: 'Users churn on slow loads',
      date: '2026-01-01',
      source: 'https://example.com/i1',
    },
    '',
  )
})

afterEach(async () => {
  await client.close()
})

function addDecision(fields: Record<string, string | string[]>) {
  return addConceptRecord(
    db,
    'glue',
    'decisions',
    {
      title: 'A decision',
      date: '2026-01-02',
      owner: 'tim',
      status: 'accepted',
      goal: 'G1',
      evidence: ['I1'],
      ...fields,
    },
    '',
  )
}

describe('loadDecisions', () => {
  it('reads an accepted Decision from the database', async () => {
    await addDecision({})

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
    await addDecision({})
    await addDecision({})
    await setDecisionStatus(db, 'glue', 'D1', 'superseded', 'D2')

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
    await addDecision({})

    const decisions = await loadDecisions(db, 'glue')

    const [found] = problems({
      body: 'Closes #1\nDecision: D99',
      files: [],
      decisions,
    })
    expect(found).toMatch(/D99/)
  })
})
