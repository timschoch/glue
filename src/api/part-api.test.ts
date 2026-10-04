import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { setProductRepository } from '../db/concept-records.ts'
import { addJoint, addPart, addProject } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createToken } from '../db/tokens.ts'
import type { GithubClient } from '../github/client.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import type { ApiRequest } from './concept-api.ts'
import {
  handleAddConcept,
  handleAddJoint,
  handleAddPart,
  handleAnswerPart,
  handleGetPart,
  handleGetProject,
  handleGetProjectConcept,
  handleListMine,
  handleListParts,
  handleRemoveJoint,
  handleUpdatePart,
} from './part-api.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let token: string
let fake: ReturnType<typeof createFakeGithub>
let github: GithubClient

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// The Project flexibeck starts with a Goal, a Guardrail and an Insight in
// its root Concept. The Project glue belongs to no token of the test.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  fake = createFakeGithub()
  github = fake.github
  ;({ token } = await createToken(db, 'flexibeck', 'orchestrator'))
  await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
  await addPart(db, 'flexibeck', {
    type: 'goal',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'okr',
  })
  await addPart(db, 'flexibeck', {
    type: 'guardrail',
    title: 'No query over 200ms',
    enforcedBy: 'monitoring',
    source: 'the hosting contract',
  })
  await addPart(db, 'flexibeck', {
    type: 'insight',
    title: 'Users churn on slow loads',
    date: '2026-09-30',
    source: 'interviews',
    evidenceLevel: 'pattern',
  })
  await addProject(db, 'glue')
})

afterAll(async () => {
  await client.close()
})

type Handler = (
  input: ApiRequest & { github: GithubClient },
) => Promise<Response>

type Call = {
  params?: Omit<ApiRequest['params'], 'project'> & { project?: string }
  body?: unknown
  query?: string
  token?: string | null
}

async function call(handler: Handler, method: string, options: Call = {}) {
  const { params, body, query = '' } = options
  const sent = options.token === undefined ? token : options.token
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  const response = await handler({
    db,
    github,
    request: new Request(`http://localhost/api/v1${query}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'flexibeck', ...params },
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : undefined }
}

const decision = {
  type: 'decision',
  title: 'Cache the product list',
  date: '2026-10-01',
  owner: 'Ada',
  status: 'proposed',
  needs: ['G1', 'I1'],
}

describe('every endpoint of the Part model', () => {
  const calls: Record<string, [Handler, string, Call]> = {
    'GET the Project': [handleGetProject, 'GET', {}],
    'GET a Concept': [
      handleGetProjectConcept,
      'GET',
      { params: { concept: 'flexibeck' } },
    ],
    'GET the Parts': [handleListParts, 'GET', {}],
    'GET a Part': [handleGetPart, 'GET', { params: { recordId: 'G1' } }],
    'POST a Concept': [
      handleAddConcept,
      'POST',
      { body: { slug: 'checkout', title: 'Checkout' } },
    ],
    'POST a Part': [
      handleAddPart,
      'POST',
      { body: { type: 'entity', title: 'Cart' } },
    ],
    'PATCH a Part': [
      handleUpdatePart,
      'PATCH',
      { params: { recordId: 'G1' }, body: { title: 'Ship slower' } },
    ],
    'POST a Joint': [
      handleAddJoint,
      'POST',
      { body: { part: 'R1', needs: 'I1' } },
    ],
    'DELETE a Joint': [
      handleRemoveJoint,
      'DELETE',
      { params: { jointId: '1' } },
    ],
    'POST an answer': [
      handleAnswerPart,
      'POST',
      { params: { recordId: 'G1' }, body: { answer: 'sink' } },
    ],
    'GET what needs the owner': [handleListMine, 'GET', {}],
  }

  it.each(Object.keys(calls))(
    '%s answers 401 without a token and changes nothing',
    async (name) => {
      const [handler, method, options] = calls[name]

      const response = await call(handler, method, { ...options, token: null })

      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('unauthorized')
      const project = await call(handleGetProject, 'GET')
      expect(project.body.concept).toMatchObject({ partCount: 3, concepts: [] })
      const goal = await call(handleGetPart, 'GET', {
        params: { recordId: 'G1' },
      })
      expect(goal.body.title).toBe('Ship faster')
    },
  )

  it.each(Object.keys(calls))(
    '%s answers 404 for the Project of another token',
    async (name) => {
      const [handler, method, options] = calls[name]

      const response = await call(handler, method, {
        ...options,
        params: { ...options.params, project: 'glue' },
      })

      expect(response.status).toBe(404)
      expect(response.body.error).toEqual({
        code: 'not-found',
        message: 'project "glue" not found',
      })
    },
  )
})

describe('GET the Project', () => {
  it('returns the Project with the tree of its Concepts', async () => {
    await call(handleAddConcept, 'POST', {
      body: { slug: 'checkout', title: 'Checkout', kind: 'brief' },
    })

    const response = await call(handleGetProject, 'GET')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      slug: 'flexibeck',
      name: 'flexibeck',
      concept: {
        slug: 'flexibeck',
        title: 'flexibeck',
        kind: null,
        partCount: 3,
        concepts: [
          {
            slug: 'checkout',
            title: 'Checkout',
            kind: 'brief',
            partCount: 0,
            concepts: [],
          },
        ],
      },
    })
  })
})

describe('Concepts', () => {
  it('adds a Concept to its parent and reads it back with its Parts', async () => {
    await call(handleAddConcept, 'POST', {
      body: { slug: 'checkout', title: 'Checkout' },
    })

    const added = await call(handleAddConcept, 'POST', {
      body: {
        slug: 'cart',
        title: 'Cart',
        kind: 'brief',
        parent: 'checkout',
      },
    })
    await call(handleAddPart, 'POST', {
      body: { type: 'flow', title: 'Pay the cart', concept: 'cart' },
    })
    const read = await call(handleGetProjectConcept, 'GET', {
      params: { concept: 'cart' },
    })

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ slug: 'cart', kind: 'brief', parts: [] })
    expect(read.status).toBe(200)
    expect(read.body).toMatchObject({
      slug: 'cart',
      title: 'Cart',
      path: [
        { slug: 'flexibeck', title: 'flexibeck' },
        { slug: 'checkout', title: 'Checkout' },
      ],
      parts: [
        {
          id: 'F1',
          type: 'flow',
          title: 'Pay the cart',
          status: null,
          concept: 'cart',
          conceptTitle: 'Cart',
        },
      ],
    })
    expect(read.body.slots).toContainEqual({ type: 'flow', filled: true })
    expect(read.body.slots).toContainEqual({ type: 'goal', filled: false })
  })

  it('answers 404 for a Concept that does not exist', async () => {
    const response = await call(handleGetProjectConcept, 'GET', {
      params: { concept: 'nope' },
    })

    expect(response.status).toBe(404)
    expect(response.body.error.message).toBe('concept "nope" not found')
  })

  it('answers 400 for a slug that is not lowercase words with hyphens', async () => {
    const response = await call(handleAddConcept, 'POST', {
      body: { slug: 'Check Out', title: 'Checkout' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('slug')
  })

  it('answers 400 for a Concept that exists already', async () => {
    const response = await call(handleAddConcept, 'POST', {
      body: { slug: 'flexibeck', title: 'Again' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe(
      'concept "flexibeck" exists already',
    )
  })
})

describe('GET the Parts', () => {
  it('lists the Parts of the Project by type, then by number', async () => {
    const response = await call(handleListParts, 'GET')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        id: 'I1',
        type: 'insight',
        title: 'Users churn on slow loads',
        status: null,
        trust: 'solid',
        workState: 'published',
        concept: 'flexibeck',
        conceptTitle: 'flexibeck',
      },
      {
        id: 'G1',
        type: 'goal',
        title: 'Ship faster',
        status: 'open',
        trust: 'not-ready',
        workState: 'draft',
        concept: 'flexibeck',
        conceptTitle: 'flexibeck',
      },
      {
        id: 'R1',
        type: 'guardrail',
        title: 'No query over 200ms',
        status: null,
        trust: 'not-ready',
        workState: 'draft',
        concept: 'flexibeck',
        conceptTitle: 'flexibeck',
      },
    ])
  })

  it('lists only the types that the query names', async () => {
    const response = await call(handleListParts, 'GET', {
      query: '?type=goal&type=guardrail',
    })

    expect(response.body.map((part: { id: string }) => part.id)).toEqual([
      'G1',
      'R1',
    ])
  })

  it('answers 400 for a type that is no Part type, and names the types', async () => {
    const response = await call(handleListParts, 'GET', {
      query: '?type=fact',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('"guardrail"')
  })
})

describe('GET a Part', () => {
  it('returns an Insight with its Evidence level', async () => {
    const response = await call(handleGetPart, 'GET', {
      params: { recordId: 'I1' },
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: 'I1',
      type: 'insight',
      title: 'Users churn on slow loads',
      status: null,
      trust: 'solid',
      workState: 'published',
      concept: 'flexibeck',
      conceptTitle: 'flexibeck',
      body: '',
      owner: null,
      date: '2026-09-30',
      source: 'interviews',
      metric: null,
      enforcedBy: null,
      evidenceLevel: 'pattern',
      issueUrl: null,
      measure: null,
      supersededBy: null,
      supersedes: [],
      needs: [],
      neededBy: [],
      flags: [],
      waitsOn: null,
      signals: [],
      answers: ['not-ready', 'sink'],
      activity: [{ kind: 'published', at: expect.any(String) }],
    })
  })

  it('returns a Guardrail with its source', async () => {
    const response = await call(handleGetPart, 'GET', {
      params: { recordId: 'R1' },
    })

    expect(response.body).toMatchObject({
      enforcedBy: 'monitoring',
      source: 'the hosting contract',
    })
  })

  it('answers 404 for a Part that does not exist', async () => {
    const response = await call(handleGetPart, 'GET', {
      params: { recordId: 'E7' },
    })

    expect(response.status).toBe(404)
    expect(response.body.error.message).toBe('part "E7" not found')
  })
})

describe('POST a Part', () => {
  it.each([
    ['entity', 'E1'],
    ['flow', 'F1'],
    ['metric', 'M1'],
  ])('adds the first %s as %s', async (type, recordId) => {
    const response = await call(handleAddPart, 'POST', {
      body: { type, title: 'Cart', owner: 'Ada', needs: ['R1'] },
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      id: recordId,
      type,
      title: 'Cart',
      owner: 'Ada',
      concept: 'flexibeck',
    })
    expect(
      response.body.needs.map((end: { part: { id: string } }) => end.part.id),
    ).toEqual(['R1'])
  })

  it('adds an Insight with its Evidence level', async () => {
    const response = await call(handleAddPart, 'POST', {
      body: {
        type: 'insight',
        title: 'Lists load in 3 seconds',
        source: 'analytics',
        evidenceLevel: 'confirmed',
      },
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      id: 'I2',
      evidenceLevel: 'confirmed',
      status: null,
    })
  })

  it('answers 400 for an Insight status other than draft, and names draft', async () => {
    const response = await call(handleAddPart, 'POST', {
      body: {
        type: 'insight',
        title: 'Lists load in 3 seconds',
        source: 'analytics',
        status: 'confirmed',
      },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid-request')
    expect(response.body.error.message).toContain('"draft"')
    expect((await call(handleListParts, 'GET')).body).toHaveLength(3)
  })

  it('answers 400 for a type that is no Part type', async () => {
    const response = await call(handleAddPart, 'POST', {
      body: { type: 'fact', title: 'The budget is 0', source: 'owner' },
    })

    expect(response.status).toBe(400)
  })

  it('answers 400 for a field of another type', async () => {
    const response = await call(handleAddPart, 'POST', {
      body: { type: 'entity', title: 'Cart', enforcedBy: 'CI' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('enforcedBy')
  })

  it('answers 400 for a needed Part that does not exist', async () => {
    const response = await call(handleAddPart, 'POST', {
      body: { type: 'entity', title: 'Cart', needs: ['D9'] },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('decision "D9" not found')
  })

  it('answers 400 for a needed Part that only another Project has', async () => {
    await addPart(db, 'glue', { type: 'entity', title: 'Technique' })

    const response = await call(handleAddPart, 'POST', {
      body: { ...decision, needs: ['G1', 'I1', 'E1'] },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('entity "E1" not found')
    expect(await db.select().from(schema.joints)).toEqual([])
  })

  it.each([null, 'https://github.com/timschoch/flexibeck-next/issues/7'])(
    'answers 400 for a Decision with the issue %s, and adds nothing',
    async (issueUrl) => {
      const response = await call(handleAddPart, 'POST', {
        body: { ...decision, status: 'accepted', issueUrl },
      })
      const decisions = await call(handleListParts, 'GET', {
        query: '?type=decision',
      })

      expect(response.status).toBe(400)
      expect(response.body.error.message).toContain('issueUrl')
      expect(decisions.body).toEqual([])
      expect(fake.issues).toEqual([])
    },
  )

  it('adds a Decision that needs any Part, in the order of the request', async () => {
    await call(handleAddPart, 'POST', { body: decision })

    const response = await call(handleAddPart, 'POST', {
      body: {
        ...decision,
        title: 'Cache it for a day',
        needs: ['G1', 'R1', 'D1'],
      },
    })

    expect(response.status).toBe(201)
    expect(
      response.body.needs.map((end: { part: { id: string } }) => end.part.id),
    ).toEqual(['G1', 'R1', 'D1'])
    expect(fake.issues).toEqual([])
  })

  it('opens the downstream issue of a Decision added as accepted', async () => {
    const response = await call(handleAddPart, 'POST', {
      body: { ...decision, status: 'accepted' },
    })

    expect(fake.issues).toHaveLength(1)
    expect(response.body.issueUrl).toEqual(expect.any(String))
    expect(response.body.issueError).toBeUndefined()
  })

  it('keeps the accepted Decision and says why the issue is missing when GitHub fails', async () => {
    github = failingGithub

    const response = await call(handleAddPart, 'POST', {
      body: { ...decision, status: 'accepted' },
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: 'D1', status: 'accepted' })
    expect(response.body.issueError).toEqual(expect.any(String))
  })
})

describe('PATCH a Part', () => {
  it('changes the fields of a Guardrail that the request names', async () => {
    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'R1' },
      body: { title: 'No query over 100ms', enforcedBy: 'the load test' },
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: 'R1',
      title: 'No query over 100ms',
      enforcedBy: 'the load test',
      source: 'the hosting contract',
    })
  })

  it('sets the Evidence level of an Insight', async () => {
    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'I1' },
      body: { evidenceLevel: 'confirmed' },
    })

    expect(response.body.evidenceLevel).toBe('confirmed')
  })

  it('answers 400 for an Insight status other than draft, and names draft', async () => {
    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'I1' },
      body: { status: 'confirmed' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('"draft"')
  })

  it('answers 400 for a field of another type', async () => {
    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'R1' },
      body: { metric: 'lead time' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('metric')
  })

  it('answers 400 for a change without a field', async () => {
    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'R1' },
      body: {},
    })

    expect(response.status).toBe(400)
  })

  it('answers 404 for a Part that does not exist', async () => {
    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'R9' },
      body: { title: 'No query over 100ms' },
    })

    expect(response.status).toBe(404)
  })

  it('opens the downstream issue when a Decision becomes accepted', async () => {
    await call(handleAddPart, 'POST', { body: decision })

    const response = await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'D1' },
      body: { status: 'accepted' },
    })

    expect(response.body.status).toBe('accepted')
    expect(fake.issues).toHaveLength(1)
  })

  it.each([null, 'https://github.com/timschoch/flexibeck-next/issues/7'])(
    'answers 400 for the issue %s, and the Decision keeps its one issue',
    async (issueUrl) => {
      const added = await call(handleAddPart, 'POST', {
        body: { ...decision, status: 'accepted' },
      })

      const response = await call(handleUpdatePart, 'PATCH', {
        params: { recordId: 'D1' },
        body: { issueUrl },
      })
      const part = await call(handleGetPart, 'GET', {
        params: { recordId: 'D1' },
      })

      expect(response.status).toBe(400)
      expect(response.body.error.message).toContain('issueUrl')
      expect(part.body.issueUrl).toBe(added.body.issueUrl)
      expect(fake.issues).toHaveLength(1)
    },
  )
})

describe('Trust and the Work state', () => {
  it('returns them with a Part, and with each Part of the list', async () => {
    const part = await call(handleGetPart, 'GET', {
      params: { recordId: 'I1' },
    })
    const parts = await call(handleListParts, 'GET', { query: '?type=goal' })

    expect(part.body).toMatchObject({
      trust: 'solid',
      workState: 'published',
      flags: [],
      waitsOn: null,
    })
    expect(parts.body).toMatchObject([
      { id: 'G1', trust: 'not-ready', workState: 'draft' },
    ])
  })

  it('returns the open flags of a Part and the Part that it waits on', async () => {
    await addJoint(db, 'flexibeck', { part: 'R1', needs: 'I1' })
    await call(handleAnswerPart, 'POST', {
      params: { recordId: 'R1' },
      body: { answer: 'supersede' },
    })
    await call(handleUpdatePart, 'PATCH', {
      params: { recordId: 'I1' },
      body: { title: 'Users leave on slow loads' },
    })

    const response = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'R1' },
      body: { answer: 'wait', waitsOn: 'I1' },
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      trust: 'flagged',
      workState: 'waiting',
      flags: [
        {
          cause: { id: 'I1', title: 'Users leave on slow loads' },
          reason: 'changed',
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        },
      ],
      waitsOn: { id: 'I1', trust: 'solid', workState: 'published' },
    })
  })

  it('answers 400 for an answer that the Work state does not take, and names the ones that it takes', async () => {
    const response = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'I1' },
      body: { answer: 'fine' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe(
      '"I1" is published: it takes the answers not-ready, sink',
    )
  })

  it('answers 400 for an answer that is not one of the six, and for "wait" without a Part', async () => {
    const unknown = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'I1' },
      body: { answer: 'ok' },
    })
    const alone = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'I1' },
      body: { answer: 'wait' },
    })

    expect(unknown.status).toBe(400)
    expect(alone.status).toBe(400)
    expect(alone.body.error.message).toContain('waitsOn')
  })

  it('lists the answers that the Part takes, and puts an answer in words at the end of the body', async () => {
    const part = await call(handleGetPart, 'GET', {
      params: { recordId: 'I1' },
    })
    const response = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'I1' },
      body: { answer: 'sink', words: 'A test proved it wrong', by: 'Agent' },
    })

    expect(part.body.answers).toEqual(['not-ready', 'sink'])
    expect(response.body.answers).toEqual([])
    expect(response.body.body).toMatch(
      /Agent, \d{4}-\d{2}-\d{2}: A test proved it wrong$/,
    )
  })

  it('answers 404 for an answer to a Part that does not exist', async () => {
    const response = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'I9' },
      body: { answer: 'sink' },
    })

    expect(response.status).toBe(404)
  })

  it('opens the downstream issue when the answer accepts a Decision', async () => {
    await call(handleAddPart, 'POST', { body: decision })

    const response = await call(handleAnswerPart, 'POST', {
      params: { recordId: 'D1' },
      body: { answer: 'supersede' },
    })

    expect(response.body).toMatchObject({
      status: 'accepted',
      trust: 'solid',
      workState: 'published',
    })
    expect(fake.issues).toHaveLength(1)
  })

  it('lists what needs the owner: the Parts in to-check, draft and review', async () => {
    await call(handleAddPart, 'POST', { body: decision })

    const response = await call(handleListMine, 'GET')

    expect(response.status).toBe(200)
    expect(
      response.body.map((part: { id: string; workState: string }) => [
        part.id,
        part.workState,
      ]),
    ).toEqual([
      ['D1', 'review'],
      ['R1', 'draft'],
      ['G1', 'draft'],
    ])
  })
})

describe('Joints', () => {
  it('glues two Parts, and both Parts show the Joint', async () => {
    const added = await call(handleAddJoint, 'POST', {
      body: { part: 'R1', needs: 'I1' },
    })
    const needing = await call(handleGetPart, 'GET', {
      params: { recordId: 'R1' },
    })
    const needed = await call(handleGetPart, 'GET', {
      params: { recordId: 'I1' },
    })

    expect(added.status).toBe(201)
    expect(added.body).toEqual({ id: 1 })
    expect(needing.body.needs).toEqual([
      {
        jointId: 1,
        twoWay: false,
        link: false,
        part: expect.objectContaining({ id: 'I1' }),
      },
    ])
    expect(needed.body.neededBy).toEqual([
      {
        jointId: 1,
        twoWay: false,
        link: false,
        part: expect.objectContaining({ id: 'R1' }),
      },
    ])
  })

  it('answers 400 for a second Joint between the same Parts', async () => {
    await call(handleAddJoint, 'POST', { body: { part: 'R1', needs: 'I1' } })

    const response = await call(handleAddJoint, 'POST', {
      body: { part: 'I1', needs: 'R1', twoWay: true },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe(
      '"I1" and "R1" have a Joint already',
    )
  })

  it('removes a Joint', async () => {
    await call(handleAddJoint, 'POST', { body: { part: 'R1', needs: 'I1' } })

    const removed = await call(handleRemoveJoint, 'DELETE', {
      params: { jointId: '1' },
    })
    const part = await call(handleGetPart, 'GET', {
      params: { recordId: 'R1' },
    })

    expect(removed).toEqual({ status: 204, body: undefined })
    expect(part.body.needs).toEqual([])
  })

  it('answers 400 for a two-way Joint that gives a Decision a second Goal', async () => {
    await call(handleAddPart, 'POST', { body: decision })
    await addPart(db, 'flexibeck', {
      type: 'goal',
      title: 'Spend less',
      metric: 'cost',
      source: 'okr',
    })

    const response = await call(handleAddJoint, 'POST', {
      body: { part: 'G2', needs: 'D1', twoWay: true },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('"D1" has a Goal already')
    expect(await db.select().from(schema.joints)).toHaveLength(2)
  })

  it.each([
    { part: 'R1', needs: 'E1' },
    { part: 'E1', needs: 'R1' },
  ])(
    'answers 400 for the Joint $part needs $needs with a Part that only another Project has',
    async (joint) => {
      await addPart(db, 'glue', { type: 'entity', title: 'Technique' })

      const response = await call(handleAddJoint, 'POST', { body: joint })

      expect(response.status).toBe(400)
      expect(response.body.error.message).toBe('entity "E1" not found')
      expect(await db.select().from(schema.joints)).toEqual([])
    },
  )

  it('answers 404 for a Joint of another Project, and the Joint stays', async () => {
    await addPart(db, 'glue', { type: 'entity', title: 'Technique' })
    await addPart(db, 'glue', { type: 'flow', title: 'Bake' })
    const id = await addJoint(db, 'glue', { part: 'F1', needs: 'E1' })

    const response = await call(handleRemoveJoint, 'DELETE', {
      params: { jointId: String(id) },
    })

    expect(response.status).toBe(404)
    expect(response.body.error.message).toBe(`joint ${id} not found`)
    expect(await db.select().from(schema.joints)).toHaveLength(1)
  })

  it.each(['7', 'one', '1.5', '1e0', '-1', ''])(
    'answers 404 for the Joint %s that does not exist',
    async (jointId) => {
      const response = await call(handleRemoveJoint, 'DELETE', {
        params: { jointId },
      })

      expect(response.status).toBe(404)
      expect(response.body.error.message).toBe(`joint ${jointId} not found`)
    },
  )

  it('answers 400 for the last Goal of a Decision', async () => {
    await call(handleAddPart, 'POST', { body: decision })

    const response = await call(handleRemoveJoint, 'DELETE', {
      params: { jointId: '1' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('joint 1 is its last one')
  })
})
