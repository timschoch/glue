import { PGlite } from '@electric-sql/pglite'
import { isRedirect } from '@tanstack/react-router'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import { createConceptActions } from './concept-actions.ts'
import { addConceptRecord, showConceptRecord } from './concept-records.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

// The session of the request in the test.
let session: Session | undefined

const actions = createConceptActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
})

beforeEach(async () => {
  session = undefined
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await addConceptRecord(
    db,
    'flexibeck',
    'goals',
    { title: 'Ship faster', metric: 'lead time', source: 'okr' },
    '',
  )
  await addConceptRecord(
    db,
    'flexibeck',
    'insights',
    {
      title: 'The build failed on a type error',
      date: '2026-03-02',
      source: 'verify ci',
      status: 'draft',
    },
    '',
  )
})

afterEach(async () => {
  await client.close()
})

function signIn() {
  session = { user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' } }
}

const draft = { product: 'flexibeck', recordId: 'I1' }

const proposal = {
  product: 'flexibeck',
  title: 'Check the types before the push',
  owner: 'Ada',
  goal: 'G1',
  evidence: ['I1'],
  body: 'A type error must not reach CI.',
}

async function listRecordIds() {
  const rows = await db.select().from(schema.insights)
  const decisions = await db.select().from(schema.decisions)
  return [...rows, ...decisions].map((row) => `${row.recordId} ${row.status}`)
}

const inputs: Record<keyof typeof actions, unknown> = {
  listProducts: undefined,
  findConcept: 'flexibeck',
  findRecord: draft,
  keepInsight: draft,
  discardInsight: draft,
  proposeDecision: proposal,
  acceptDecision: { product: 'flexibeck', recordId: 'D1' },
}

describe('a server function without a session', () => {
  it.each(Object.keys(actions) as (keyof typeof actions)[])(
    '%s sends the person to sign-in and writes nothing',
    async (name) => {
      const refused = await actions[name](inputs[name]).then(
        () => undefined,
        (error: unknown) => error,
      )

      expect(isRedirect(refused) && refused.options.to).toBe('/sign-in')
      expect(await listRecordIds()).toEqual(['I1 draft'])
    },
  )
})

describe('a server function with a session', () => {
  beforeEach(signIn)

  it('lists the Products', async () => {
    await addConceptRecord(
      db,
      'glue',
      'facts',
      { title: 'Glue keeps the why', source: 'readme' },
      '',
    )

    expect(await actions.listProducts(undefined)).toEqual([
      { slug: 'flexibeck', name: 'flexibeck' },
      { slug: 'glue', name: 'glue' },
    ])
  })

  it('reads the Concept and a record of the Product in the request', async () => {
    const concept = await actions.findConcept('flexibeck')
    const record = await actions.findRecord(draft)

    expect(concept?.insights.map((insight) => insight.id)).toEqual(['I1'])
    expect(record?.title).toBe('The build failed on a type error')
    expect(await actions.findConcept('nope')).toBeUndefined()
  })

  it('keeps a draft Insight', async () => {
    expect(await actions.keepInsight(draft)).toBeUndefined()

    expect(await listRecordIds()).toEqual(['I1 null'])
  })

  it('discards a draft Insight', async () => {
    expect(await actions.discardInsight(draft)).toBeUndefined()

    expect(await listRecordIds()).toEqual([])
  })

  it('says why it does not discard an Insight that is not a draft', async () => {
    await actions.keepInsight(draft)

    expect(await actions.discardInsight(draft)).toEqual({
      message: '"I1" is not a draft',
    })
  })

  it('proposes a Decision, then accepts it', async () => {
    expect(await actions.proposeDecision(proposal)).toEqual({ id: 'D1' })
    expect(await listRecordIds()).toEqual(['I1 draft', 'D1 proposed'])

    expect(
      await actions.acceptDecision({ product: 'flexibeck', recordId: 'D1' }),
    ).toBeUndefined()
    expect(await listRecordIds()).toEqual(['I1 draft', 'D1 accepted'])
  })

  it('saves a Decision that supersedes another as accepted', async () => {
    await actions.proposeDecision(proposal)

    expect(
      await actions.proposeDecision({ ...proposal, supersedes: 'D1' }),
    ).toEqual({ id: 'D2' })

    const old = await showConceptRecord(db, 'flexibeck', 'D1')
    expect(old.fields.status).toBe('superseded')
    expect(old.supersededBy).toBe('D2')
    const added = await showConceptRecord(db, 'flexibeck', 'D2')
    expect(added.fields.status).toBe('accepted')
  })

  it('says which rule a Decision breaks', async () => {
    expect(
      await actions.proposeDecision({ ...proposal, evidence: ['I9'] }),
    ).toEqual({ message: 'evidence "I9" not found' })
  })

  it('does not take the status of a Decision from the request', async () => {
    await actions.proposeDecision({ ...proposal, status: 'accepted' })

    expect(await listRecordIds()).toEqual(['I1 draft', 'D1 proposed'])
  })

  it('refuses text that is not the id of a record', async () => {
    await expect(
      actions.keepInsight({ product: 'flexibeck', recordId: 'nope' }),
    ).rejects.toThrow(/not the id of a record/)
  })
})
