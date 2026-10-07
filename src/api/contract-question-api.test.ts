import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signContract } from '../db/contracts.ts'
import { assign, joinProject } from '../db/members.ts'
import { addConcept, addPart } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import type { ApiRequest } from './api-request.ts'
import { handleGetContract } from './contract-api.ts'
import {
  handleAnswerContractQuestion,
  handleAskContractQuestion,
  handleListContractQuestions,
  handleListMineContractQuestions,
} from './contract-question-api.ts'

const { db } = createTestDatabase(schema)

let token: string

// The Concept `videos` of flexibeck has Contract Version 1. Mara is
// Responsible for it.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
  ;({ token } = await createToken(db, 'flexibeck', 'agent'))
  await addConcept(db, 'flexibeck', {
    slug: 'videos',
    title: 'Technique videos',
  })
  await addPart(db, 'flexibeck', {
    type: 'insight',
    concept: 'videos',
    title: 'Bakers want step videos',
    source: 'interview',
  })
  await signContract(db, 'flexibeck', 'videos', 'Mara')
  await joinProject(db, 'flexibeck', {
    id: 'user-mara',
    name: 'Mara',
    email: 'mara@example.com',
  })
  await assign(db, 'flexibeck', {
    member: 'mara@example.com',
    concept: 'videos',
    role: 'responsible',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

type Handler = (input: ApiRequest) => Promise<Response>

async function call(
  handler: Handler,
  method: string,
  options: { questionId?: string; body?: unknown; query?: string } = {},
  sent: string | null = token,
) {
  const { questionId, body, query = '' } = options
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  const response = await handler({
    db,
    request: new Request(`http://localhost/api/v1${query}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'flexibeck', concept: 'videos', questionId },
  })
  return { status: response.status, body: await response.json() }
}

const asked = {
  id: 1,
  concept: 'videos',
  conceptTitle: 'Technique videos',
  version: 1,
  stale: false,
  text: 'Does a Technique need a video?',
  askedBy: 'build-agent',
  askedAt: '2026-10-03T12:00:00.000Z',
  answer: null,
}

const ask = (body: unknown = { text: asked.text, askedBy: 'build-agent' }) =>
  call(handleAskContractQuestion, 'POST', { body })

describe('POST a question about the Contract of a Concept', () => {
  it('answers the question with the newest Version', async () => {
    expect(await ask()).toEqual({ status: 201, body: asked })
    expect(await call(handleListContractQuestions, 'GET')).toEqual({
      status: 200,
      body: [asked],
    })
  })

  it('wants a text', async () => {
    const { status } = await ask({ askedBy: 'build-agent' })

    expect(status).toBe(400)
  })

  it('answers 401 without a token', async () => {
    const { status } = await call(
      handleAskContractQuestion,
      'POST',
      { body: { text: asked.text, askedBy: 'build-agent' } },
      null,
    )

    expect(status).toBe(401)
  })
})

describe('GET the open questions of a Project', () => {
  it('gives a member the questions that the member answers', async () => {
    await ask()

    const mine = await call(handleListMineContractQuestions, 'GET', {
      query: '?member=mara@example.com',
    })
    const other = await call(handleListMineContractQuestions, 'GET', {
      query: '?member=fred@example.com',
    })

    expect(mine).toEqual({ status: 200, body: [asked] })
    expect(other).toEqual({ status: 200, body: [] })
  })
})

describe('PATCH a question with its answer', () => {
  it('answers the question, and the Contract holds it from then on', async () => {
    await ask()
    vi.setSystemTime(new Date('2026-10-04T09:00Z'))
    const answered = {
      ...asked,
      answer: {
        text: 'Yes, each one.',
        by: 'Mara',
        at: '2026-10-04T09:00:00.000Z',
      },
    }

    const response = await call(handleAnswerContractQuestion, 'PATCH', {
      questionId: '1',
      body: { text: 'Yes, each one.', answeredBy: 'Mara' },
    })
    const contract = await call(handleGetContract, 'GET')

    expect(response).toEqual({ status: 200, body: answered })
    expect(contract.body.questions).toEqual([answered])
  })

  it('answers 404 for an id that is no number', async () => {
    const { status } = await call(handleAnswerContractQuestion, 'PATCH', {
      questionId: 'first',
      body: { text: 'Yes.', answeredBy: 'Mara' },
    })

    expect(status).toBe(404)
  })
})
