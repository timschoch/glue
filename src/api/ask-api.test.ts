import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { joinProject } from '../db/members.ts'
import { addPart, addProject } from '../db/part-records.ts'
import { addProjectReference } from '../db/projects.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import type { ApiRequest } from './api-request.ts'
import { handleAddAsk, handleListAsks, handleUpdateAsk } from './ask-api.ts'

const { db } = createTestDatabase(schema)
const tokens = { bakeday: '', ux: '' }

// Project `bakeday` may reference Project `ux`. `bakeday` has the Hunch I1.
// Fred is the member of `ux`, and `ux` has the published Insight I1.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
  await addProject(db, 'bakeday', 'Bakeday')
  await addProject(db, 'ux', 'UX team')
  await addProjectReference(db, 'bakeday', 'ux')
  tokens.bakeday = (await createToken(db, 'bakeday', 'mara')).token
  tokens.ux = (await createToken(db, 'ux', 'fred')).token
  await joinProject(db, 'ux', {
    id: 'user-fred',
    name: 'Fred',
    email: 'fred@example.com',
  })
  await addPart(db, 'bakeday', {
    type: 'insight',
    title: 'Novices skip the fold',
    source: 'support',
    evidenceLevel: 'hunch',
  })
  await addPart(db, 'ux', {
    type: 'insight',
    title: 'Novices do not know the word fold',
    source: 'study',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

type Call = {
  project: keyof typeof tokens
  body?: unknown
  query?: string
  askId?: string
  token?: string | null
}

async function call(
  handler: (input: ApiRequest) => Promise<Response>,
  method: string,
  { project, body, query = '', askId, token = tokens[project] }: Call,
) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (token) headers.set('authorization', `Bearer ${token}`)
  const response = await handler({
    db,
    request: new Request(`http://localhost/api/v1${query}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project, askId },
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : undefined }
}

const ask = { insight: 'I1', toProject: 'ux' }

describe('the Ask routes', () => {
  it.each([
    ['GET asks', handleListAsks, 'GET', undefined],
    ['POST asks', handleAddAsk, 'POST', ask],
    ['PATCH asks/1', handleUpdateAsk, 'PATCH', { insight: 'I1' }],
  ] as const)(
    '%s answers 401 without a token',
    async (_name, handler, method, body) => {
      const response = await call(handler, method, {
        project: 'bakeday',
        body,
        askId: '1',
        token: null,
      })

      expect(response.status).toBe(401)
    },
  )

  it('take an Ask from the Hunch to the Insight that is handed back', async () => {
    const added = await call(handleAddAsk, 'POST', {
      project: 'bakeday',
      body: ask,
    })
    const picked = await call(handleUpdateAsk, 'PATCH', {
      project: 'ux',
      askId: '1',
      body: { pickedBy: 'fred@example.com' },
    })
    const toHandBack = await call(handleListAsks, 'GET', {
      project: 'ux',
      query: '?member=fred@example.com',
    })
    const handedBack = await call(handleUpdateAsk, 'PATCH', {
      project: 'ux',
      askId: '1',
      body: { insight: 'I1' },
    })
    const toCheck = await call(handleListAsks, 'GET', { project: 'bakeday' })

    expect(added).toEqual({ status: 201, body: { id: 1 } })
    expect(picked.status).toBe(204)
    expect(toHandBack.body).toMatchObject([{ id: 1, step: 'hand-back' }])
    expect(handedBack.status).toBe(204)
    expect(toCheck).toEqual({
      status: 200,
      body: [
        {
          id: 1,
          step: 'check',
          hunch: {
            project: { slug: 'bakeday', name: 'Bakeday' },
            id: 'I1',
            title: 'Novices skip the fold',
            trust: 'solid',
            concept: 'bakeday',
          },
          project: { slug: 'ux', name: 'UX team' },
          pickedBy: { name: 'Fred', email: 'fred@example.com' },
          insight: {
            project: { slug: 'ux', name: 'UX team' },
            id: 'I1',
            title: 'Novices do not know the word fold',
            trust: 'solid',
            concept: 'ux',
          },
          askedAt: '2026-10-03T12:00:00.000Z',
        },
      ],
    })
  })

  it('answer 400 to a rule that the Ask breaks', async () => {
    const response = await call(handleAddAsk, 'POST', {
      project: 'ux',
      body: { insight: 'I1', toProject: 'bakeday' },
    })

    expect(response).toEqual({
      status: 400,
      body: {
        error: {
          code: 'invalid-request',
          message: 'Project "ux" cannot ask Project "bakeday"',
        },
      },
    })
  })

  it('answer 404 to an Ask id that is no number', async () => {
    const response = await call(handleUpdateAsk, 'PATCH', {
      project: 'ux',
      askId: 'one',
      body: { insight: 'I1' },
    })

    expect(response.status).toBe(404)
  })
})
