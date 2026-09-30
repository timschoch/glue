import { PGlite } from '@electric-sql/pglite'
import { isRedirect } from '@tanstack/react-router'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import type { GithubClient } from '../github/client.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import {
  createConceptActions,
  goalUpdateInputSchema,
} from './concept-actions.ts'
import {
  addConceptRecord,
  setProductRepository,
  showConceptRecord,
} from './concept-records.ts'
import { proposalInputSchema, recordInputSchema } from './decision-proposal.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

// The session and the GitHub of the request in the test.
let session: Session | undefined
let fake: ReturnType<typeof createFakeGithub>
let github: GithubClient

const actions = createConceptActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
  getGithub: () => github,
})

beforeEach(async () => {
  session = undefined
  fake = createFakeGithub()
  github = fake.github
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

const decision = { product: 'flexibeck', recordId: 'D1' }

const closedGoal = {
  product: 'flexibeck',
  recordId: 'G1',
  status: 'achieved' as const,
}

const requests = {
  listProducts: () => actions.listProducts(),
  findConcept: () => actions.findConcept('flexibeck'),
  findRecord: () => actions.findRecord(draft),
  keepInsight: () => actions.keepInsight(draft),
  discardInsight: () => actions.discardInsight(draft),
  proposeDecision: () => actions.proposeDecision(proposal),
  acceptDecision: () => actions.acceptDecision(decision),
  updateGoal: () => actions.updateGoal(closedGoal),
} satisfies Record<keyof typeof actions, () => Promise<unknown>>

describe('a server function without a session', () => {
  it.each(Object.keys(actions) as (keyof typeof actions)[])(
    '%s sends the person to sign-in and writes nothing',
    async (name) => {
      const refused = await requests[name]().then(
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

    expect(await actions.listProducts()).toEqual([
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

  it('says that the Product of a write does not exist', async () => {
    expect(await actions.keepInsight({ ...draft, product: 'nope' })).toEqual({
      message: 'product "nope" not found',
    })
  })

  it('proposes a Decision, then accepts it', async () => {
    expect(await actions.proposeDecision(proposal)).toEqual({
      id: 'D1',
      issueMissing: false,
    })
    expect(await listRecordIds()).toEqual(['I1 draft', 'D1 proposed'])

    expect(await actions.acceptDecision(decision)).toEqual({
      id: 'D1',
      issueMissing: false,
    })
    expect(await listRecordIds()).toEqual(['I1 draft', 'D1 accepted'])
  })

  it('opens the downstream issue when a person accepts a Decision', async () => {
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck')
    await actions.proposeDecision(proposal)
    expect(fake.issues).toEqual([])

    await actions.acceptDecision(decision)

    expect(fake.issues.map(({ issue }) => issue.title)).toEqual([
      'D1: Check the types before the push',
    ])
    const accepted = await showConceptRecord(db, 'flexibeck', 'D1')
    expect(accepted.fields.issue).toBe(
      'https://github.com/timschoch/flexibeck/issues/1',
    )
  })

  it('opens the downstream issue of a Decision that supersedes another', async () => {
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck')
    await actions.proposeDecision(proposal)

    await actions.proposeDecision({ ...proposal, supersedes: 'D1' })

    expect(fake.issues.map(({ issue }) => issue.title)).toEqual([
      'D2: Check the types before the push',
    ])
  })

  it('keeps the accepted Decision and says that the issue is missing when GitHub fails', async () => {
    await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck')
    await actions.proposeDecision(proposal)
    github = failingGithub

    expect(await actions.acceptDecision(decision)).toEqual({
      id: 'D1',
      issueMissing: true,
    })
    expect(await listRecordIds()).toEqual(['I1 draft', 'D1 accepted'])
  })

  it('saves a Decision that supersedes another as accepted', async () => {
    await actions.proposeDecision(proposal)

    expect(
      await actions.proposeDecision({ ...proposal, supersedes: 'D1' }),
    ).toEqual({ id: 'D2', issueMissing: false })

    const old = await showConceptRecord(db, 'flexibeck', 'D1')
    expect(old.fields.status).toBe('superseded')
    expect(old.supersededBy).toBe('D2')
    const added = await showConceptRecord(db, 'flexibeck', 'D2')
    expect(added.fields.status).toBe('accepted')
  })

  it('closes a Goal as achieved, then opens it again', async () => {
    expect(await actions.updateGoal(closedGoal)).toBeUndefined()
    expect(await actions.findRecord(closedGoal)).toMatchObject({
      status: 'achieved',
    })

    expect(
      await actions.updateGoal({ ...closedGoal, status: 'open' }),
    ).toBeUndefined()
    expect(await actions.findRecord(closedGoal)).toMatchObject({
      status: 'open',
    })
  })

  it('says that the Goal of a status change does not exist', async () => {
    expect(await actions.updateGoal({ ...closedGoal, recordId: 'G9' })).toEqual(
      { message: 'goal "G9" not found' },
    )
  })

  it('says which rule a Decision breaks', async () => {
    expect(
      await actions.proposeDecision({ ...proposal, evidence: ['I9'] }),
    ).toEqual({ message: 'evidence "I9" not found' })
  })
})

describe('the input of a server function', () => {
  it('does not take the status of a Decision from the request', () => {
    expect(
      proposalInputSchema.parse({ ...proposal, status: 'accepted' }),
    ).toEqual(proposal)
  })

  it('refuses a Decision without evidence, like the HTTP API', () => {
    expect(
      proposalInputSchema.safeParse({ ...proposal, evidence: [] }).success,
    ).toBe(false)
  })

  it('takes only the status of a Goal from the request, not its measure', () => {
    expect(
      goalUpdateInputSchema.parse({ ...closedGoal, measure: null }),
    ).toEqual(closedGoal)
    expect(
      goalUpdateInputSchema.safeParse({ ...closedGoal, status: 'done' })
        .success,
    ).toBe(false)
  })

  it('refuses text that is not the id of a record', () => {
    expect(() =>
      recordInputSchema.parse({ product: 'flexibeck', recordId: 'nope' }),
    ).toThrow(/not the id of a record/)
  })
})
