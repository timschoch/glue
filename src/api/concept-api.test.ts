import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addConceptRecord } from '../db/concept-records.ts'
import * as schema from '../db/schema.ts'
import { createToken } from '../db/tokens.ts'
import {
  handleAddRecord,
  handleGetConcept,
  handleGetRecord,
  handleListRecords,
  handleUpdateDecision,
} from './concept-api.ts'
import type { ApiRequest } from './concept-api.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let token: string

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  ;({ token } = await createToken(db, 'flexibeck', 'orchestrator'))
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
    'facts',
    { title: 'p95 load time is 3s', source: 'monitoring' },
    '',
  )
  await addConceptRecord(
    db,
    'glue',
    'facts',
    { title: 'Glue keeps the why', source: 'readme' },
    '',
  )
})

afterEach(async () => {
  await client.close()
})

type Params = ApiRequest['params']

function request(
  method: string,
  options: { token?: string; body?: unknown } = {},
) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (options.token) headers.set('authorization', `Bearer ${options.token}`)
  return new Request('http://localhost/api/v1', {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

async function call(
  handler: (input: ApiRequest) => Promise<Response>,
  method: string,
  params: Params,
  body?: unknown,
) {
  const response = await handler({
    db,
    request: request(method, { token, body }),
    params,
  })
  return { status: response.status, body: await response.json() }
}

describe('authentication', () => {
  it('answers 401 without a token', async () => {
    const response = await handleGetConcept({
      db,
      request: request('GET'),
      params: { product: 'flexibeck' },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'unauthorized', message: expect.any(String) },
    })
  })

  it('answers 401 with a wrong token', async () => {
    const response = await handleGetConcept({
      db,
      request: request('GET', { token: 'glue_wrong' }),
      params: { product: 'flexibeck' },
    })

    expect(response.status).toBe(401)
  })

  it('answers 404 for another Product', async () => {
    const response = await call(handleGetConcept, 'GET', { product: 'glue' })

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('not-found')
  })
})

describe('GET /concept', () => {
  it('returns the records of the Product grouped by type', async () => {
    const response = await call(handleGetConcept, 'GET', {
      product: 'flexibeck',
    })

    expect(response.status).toBe(200)
    expect(response.body.product.slug).toBe('flexibeck')
    expect(response.body.goals).toEqual([
      { id: 'G1', title: 'Ship faster', metric: 'lead time' },
    ])
    expect(response.body.facts).toEqual([
      { id: 'F1', title: 'p95 load time is 3s' },
    ])
  })
})

describe('Insights', () => {
  it('adds an Insight and reads it back', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'insights' },
      {
        title: 'Users churn on slow loads',
        date: '2026-09-30',
        source: 'interviews',
        body: 'Five of eight said so.',
        status: 'draft',
      },
    )
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ kind: 'insight', id: 'I1' })

    const read = await call(handleGetRecord, 'GET', {
      product: 'flexibeck',
      folder: 'insights',
      recordId: 'I1',
    })
    expect(read.status).toBe(200)
    expect(read.body).toEqual({
      kind: 'insight',
      id: 'I1',
      title: 'Users churn on slow loads',
      date: '2026-09-30',
      source: 'interviews',
      status: 'draft',
      body: 'Five of eight said so.',
      decisions: [],
    })

    const listed = await call(handleListRecords, 'GET', {
      product: 'flexibeck',
      folder: 'insights',
    })
    expect(listed.body).toEqual([
      {
        id: 'I1',
        title: 'Users churn on slow loads',
        date: '2026-09-30',
        status: 'draft',
      },
    ])
  })

  it('answers 400 for an Insight without a title', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'insights' },
      { source: 'interviews' },
    )

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid-request')
    expect(response.body.error.message).toContain('title')
  })

  it('answers 400 for a body that is not JSON', async () => {
    const response = await handleAddRecord({
      db,
      request: new Request('http://localhost/api/v1', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: '{',
      }),
      params: { product: 'flexibeck', folder: 'insights' },
    })

    expect(response.status).toBe(400)
  })
})

describe('Facts', () => {
  it('adds a Fact', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'facts' },
      { title: 'The budget is 0', source: 'owner' },
    )

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ kind: 'fact', id: 'F2', body: '' })
  })
})

describe('Decisions', () => {
  const decision = {
    title: 'Cache the homepage',
    date: '2026-09-30',
    owner: 'orchestrator',
    status: 'accepted',
    goal: 'G1',
    evidence: ['F1'],
    body: 'Cache reads at the edge.',
  }

  it('adds a Decision with its evidence', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      decision,
    )

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({
      kind: 'decision',
      id: 'D1',
      goal: { id: 'G1', title: 'Ship faster' },
      evidence: [{ id: 'F1', title: 'p95 load time is 3s' }],
    })
  })

  it('answers 400 for evidence that does not exist', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      { ...decision, evidence: ['I9'] },
    )

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('evidence "I9" not found')
  })

  it('answers 400 for evidence of another Product', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      { ...decision, evidence: ['F2'] },
    )

    expect(response.status).toBe(400)
  })

  it('answers 400 for a Decision without evidence', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      { ...decision, evidence: [] },
    )

    expect(response.status).toBe(400)
  })

  it('supersedes a Decision by another', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, decision)
    await call(handleAddRecord, 'POST', params, {
      ...decision,
      title: 'Cache every page',
    })

    const updated = await call(
      handleUpdateDecision,
      'PATCH',
      { ...params, recordId: 'D1' },
      { status: 'superseded', superseded_by: 'D2' },
    )

    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({
      id: 'D1',
      status: 'superseded',
      supersededBy: { id: 'D2', title: 'Cache every page' },
    })
  })

  it('answers 400 for a superseded Decision without superseded_by', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, decision)

    const response = await call(
      handleUpdateDecision,
      'PATCH',
      { ...params, recordId: 'D1' },
      { status: 'superseded' },
    )

    expect(response.status).toBe(400)
  })

  it('answers 404 for a Decision that does not exist', async () => {
    const response = await call(
      handleUpdateDecision,
      'PATCH',
      { product: 'flexibeck', folder: 'decisions', recordId: 'D9' },
      { status: 'accepted' },
    )

    expect(response.status).toBe(404)
  })

  it('answers 409 when two Decisions race for the same id', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    const responses = await Promise.all([
      call(handleAddRecord, 'POST', params, decision),
      call(handleAddRecord, 'POST', params, decision),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ])
  })
})

describe('paths that name no record', () => {
  it('answers 404 for a record of another folder', async () => {
    const response = await call(handleGetRecord, 'GET', {
      product: 'flexibeck',
      folder: 'goals',
      recordId: 'F1',
    })

    expect(response.status).toBe(404)
  })

  it('answers 404 for a folder that does not exist', async () => {
    const response = await call(handleListRecords, 'GET', {
      product: 'flexibeck',
      folder: 'ideas',
    })

    expect(response.status).toBe(404)
  })

  it('answers 404 for a Goal added over the API', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'goals' },
      { title: 'Grow', metric: 'users', source: 'okr' },
    )

    expect(response.status).toBe(404)
  })
})
