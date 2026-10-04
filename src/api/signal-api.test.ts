import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { setProductRepository } from '../db/concept-records.ts'
import { addProject } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createToken } from '../db/tokens.ts'
import type { GithubClient } from '../github/client.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import type { ChangeRequest } from './concept-api.ts'
import { handleAddSignalInsight, handleListSignals } from './signal-api.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let token: string
let github: GithubClient

const signal = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  createdAt: '2026-10-02T08:00:00Z',
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  github = createFakeGithub([signal]).github
  await addProject(db, 'glue')
  await setProductRepository(db, 'glue', 'timschoch/glue')
  ;({ token } = await createToken(db, 'glue', 'orchestrator'))
})

afterAll(async () => {
  await client.close()
})

type Handler = (input: ChangeRequest) => Promise<Response>

async function call(handler: Handler, method: string, body?: unknown) {
  const response = await handler({
    db,
    github,
    request: new Request('http://localhost/api/v1', {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'glue' },
  })
  return { status: response.status, body: await response.json() }
}

describe('GET /projects/{project}/signals', () => {
  it('lists the Signals of the Project', async () => {
    const { status, body } = await call(handleListSignals, 'GET')

    expect(status).toBe(200)
    expect(body).toEqual({
      reason: null,
      signals: [
        {
          url: signal.url,
          title: signal.title,
          date: '2026-10-02',
          insight: null,
        },
      ],
    })
  })

  it('answers an empty list with the reason when GitHub fails', async () => {
    github = failingGithub

    const { status, body } = await call(handleListSignals, 'GET')

    expect(status).toBe(200)
    expect(body).toEqual({ signals: [], reason: 'GitHub answered 503' })
  })

  it('refuses a request without a token', async () => {
    token = 'nope'

    expect((await call(handleListSignals, 'GET')).status).toBe(401)
  })
})

describe('POST /projects/{project}/signals/insights', () => {
  it('adds the Insight and answers it with its Signals', async () => {
    const { status, body } = await call(handleAddSignalInsight, 'POST', {
      signals: [signal.url],
      title: 'Long lists are slow',
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({
      id: 'I1',
      evidenceLevel: 'hunch',
      workState: 'draft',
      signals: [{ url: signal.url, title: signal.title }],
    })
  })

  it('answers 400 for an address that is not a Signal', async () => {
    const { status, body } = await call(handleAddSignalInsight, 'POST', {
      signals: ['https://github.com/timschoch/glue/issues/99'],
      title: 'A guess',
    })

    expect(status).toBe(400)
    expect(body.error.code).toBe('invalid-request')
  })

  it('answers 400 for no Signal', async () => {
    const { status } = await call(handleAddSignalInsight, 'POST', {
      signals: [],
      title: 'A guess',
    })

    expect(status).toBe(400)
  })
})
