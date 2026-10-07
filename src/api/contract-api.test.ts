import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { updateKind } from '../db/kinds.ts'
import {
  addConcept,
  addPart,
  answerPart,
  updatePart,
} from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createToken } from '../db/tokens.ts'
import type { ApiRequest } from './api-request.ts'
import { handleGetContract, handleSignContract } from './contract-api.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let token: string

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// The Brief `videos` of flexibeck has the Insight I1 and the Flow F1. The
// Flow starts as a draft. The Brief of flexibeck requires an Insight, a
// Goal, a Decision and a Flow.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  ;({ token } = await createToken(db, 'flexibeck', 'agent'))
  await updateKind(db, 'flexibeck', 'brief', {
    slots: [
      { type: 'insight' },
      { type: 'goal' },
      { type: 'decision' },
      { type: 'flow' },
      { type: 'entity', required: false },
    ],
  })
  await addConcept(db, 'flexibeck', {
    slug: 'videos',
    title: 'Technique videos',
    kind: 'brief',
  })
  await addPart(db, 'flexibeck', {
    type: 'insight',
    concept: 'videos',
    title: 'Bakers want step videos',
    source: 'interview',
    date: '2026-10-01',
  })
  await addPart(db, 'flexibeck', {
    type: 'goal',
    title: 'First bake feels easy',
    metric: 'ease',
    source: 'okr',
  })
  await answerPart(db, 'flexibeck', 'G1', { answer: 'supersede' })
  await addPart(db, 'flexibeck', {
    type: 'decision',
    concept: 'videos',
    title: 'Show the video of the creator',
    owner: 'Tim',
    date: '2026-10-02',
    status: 'accepted',
    needs: ['G1', 'I1'],
  })
  await addPart(db, 'flexibeck', {
    type: 'flow',
    concept: 'videos',
    title: 'Watch a technique',
    needs: ['D1'],
  })
})

afterAll(async () => {
  await client.close()
})

type Handler = (input: ApiRequest) => Promise<Response>

async function call(
  handler: Handler,
  method: string,
  options: { concept?: string; body?: unknown; query?: string } = {},
  sent: string | null = token,
) {
  const { concept = 'videos', body, query = '' } = options
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  const response = await handler({
    db,
    request: new Request(`http://localhost/api/v1${query}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'flexibeck', concept },
  })
  return { status: response.status, body: await response.json() }
}

const sign = () =>
  call(handleSignContract, 'POST', { body: { signedBy: 'Ada' } })

function publishFlow() {
  return answerPart(db, 'flexibeck', 'F1', { answer: 'supersede' })
}

describe('POST the Contract of a Concept', () => {
  it('names the Parts that block the sign-off', async () => {
    const { status, body } = await sign()

    expect(status).toBe(400)
    expect(body.error.message).toBe('sign-off needs Trust solid: F1')
  })

  it('signs off and answers the new Version, tier 1 before tier 2', async () => {
    await publishFlow()

    const { status, body } = await sign()

    expect(status).toBe(201)
    expect(body).toMatchObject({
      concept: 'videos',
      version: 1,
      newestVersion: 1,
      signedBy: 'Ada',
    })
    expect(body.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(body.tier1.map((part: { id: string }) => part.id)).toEqual(['F1'])
    expect(body.tier2.map((part: { id: string }) => part.id)).toEqual([
      'I1',
      'D1',
    ])
    const keys = Object.keys(body)
    expect(keys.indexOf('tier1')).toBeLessThan(keys.indexOf('tier2'))
  })

  it('names the required slots that are empty', async () => {
    await publishFlow()
    await updateKind(db, 'flexibeck', 'brief', {
      slots: [{ type: 'entity' }, { type: 'guardrail' }],
    })

    const { status, body } = await sign()

    expect(status).toBe(400)
    expect(body.error.message).toBe(
      'sign-off needs each required slot filled: entity, guardrail',
    )
  })

  it('wants the name of who signs', async () => {
    await publishFlow()

    const { status } = await call(handleSignContract, 'POST', { body: {} })

    expect(status).toBe(400)
  })

  it('answers 404 for a Concept that the Project does not have', async () => {
    const response = await call(handleSignContract, 'POST', {
      concept: 'nope',
      body: { signedBy: 'Ada' },
    })

    expect(response).toEqual({
      status: 404,
      body: {
        error: { code: 'not-found', message: 'concept "nope" not found' },
      },
    })
  })

  it('answers 401 without a token and writes nothing', async () => {
    await publishFlow()

    const { status } = await call(
      handleSignContract,
      'POST',
      { body: { signedBy: 'Ada' } },
      null,
    )

    expect(status).toBe(401)
    expect((await call(handleGetContract, 'GET')).status).toBe(404)
  })
})

describe('GET the Contract of a Concept', () => {
  it('answers 404 before the first sign-off', async () => {
    const { status, body } = await call(handleGetContract, 'GET')

    expect(status).toBe(404)
    expect(body.error.message).toBe('"videos" has no Contract Version')
  })

  it('gives the newest Version, and an older one with ?version', async () => {
    await publishFlow()
    await sign()
    await updatePart(db, 'flexibeck', 'F1', { title: 'Watch a step' })
    await sign()

    const newest = await call(handleGetContract, 'GET')
    expect(newest.body).toMatchObject({ version: 2, newestVersion: 2 })
    expect(newest.body.tier1[0].title).toBe('Watch a step')
    expect(newest.body.slots).toContainEqual({
      type: 'goal',
      required: true,
      filled: false,
    })

    const first = await call(handleGetContract, 'GET', {
      query: '?version=1',
    })
    expect(first.body).toMatchObject({ version: 1, newestVersion: 2 })
    expect(first.body.tier1[0].title).toBe('Watch a technique')
  })

  it('gives the steps of a Flow and the fields of an Entity as data', async () => {
    await addPart(db, 'flexibeck', {
      type: 'entity',
      concept: 'videos',
      title: 'Technique',
      fields: [{ name: 'video', meaning: 'The clip of the creator' }],
      needs: ['D1'],
    })
    await answerPart(db, 'flexibeck', 'E1', { answer: 'supersede' })
    await updatePart(db, 'flexibeck', 'F1', {
      steps: [{ text: 'Start the video', entity: 'E1' }],
    })
    await publishFlow()
    await sign()

    const { body } = await call(handleGetContract, 'GET')

    expect(
      body.tier1.map(
        ({
          id,
          steps,
          fields,
        }: {
          id: string
          steps: unknown
          fields: unknown
        }) => ({
          id,
          steps,
          fields,
        }),
      ),
    ).toEqual([
      {
        id: 'F1',
        steps: [{ text: 'Start the video', entity: 'E1' }],
        fields: [],
      },
      {
        id: 'E1',
        steps: [],
        fields: [{ name: 'video', meaning: 'The clip of the creator' }],
      },
    ])
  })

  it('answers 404 for a Version that the Concept does not have, and 400 for no number', async () => {
    await publishFlow()
    await sign()

    const missing = await call(handleGetContract, 'GET', {
      query: '?version=7',
    })
    const invalid = await call(handleGetContract, 'GET', {
      query: '?version=new',
    })

    expect(missing.status).toBe(404)
    expect(invalid.status).toBe(400)
  })
})
