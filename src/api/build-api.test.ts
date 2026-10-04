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
import { handleListBuilds, projectBuildsSchema } from './build-api.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let token: string
let github: GithubClient

const pullRequest = {
  number: 12,
  url: 'https://github.com/timschoch/glue/pull/12',
  title: 'Show the builds',
  state: 'open' as const,
  body: 'Fixes #3',
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  github = createFakeGithub([], [pullRequest]).github
  await addProject(db, 'glue')
  await setProductRepository(db, 'glue', 'timschoch/glue')
  ;({ token } = await createToken(db, 'glue', 'orchestrator'))
})

afterAll(async () => {
  await client.close()
})

async function call(authorization = `Bearer ${token}`) {
  const response = await handleListBuilds({
    db,
    github,
    request: new Request('http://localhost/api/v1', {
      headers: { authorization },
    }),
    params: { project: 'glue' },
  })
  return { status: response.status, body: await response.json() }
}

describe('GET /projects/{project}/builds', () => {
  it('lists the builds of the Project in the shape of the schema', async () => {
    const { status, body } = await call()

    expect(status).toBe(200)
    expect(projectBuildsSchema.parse(body)).toEqual({
      reason: null,
      builds: [
        {
          number: 12,
          url: pullRequest.url,
          title: 'Show the builds',
          state: 'open',
          decisions: [],
          contract: null,
          stale: false,
        },
      ],
    })
  })

  it('answers an empty list with the reason when GitHub fails', async () => {
    github = failingGithub

    const { status, body } = await call()

    expect(status).toBe(200)
    expect(body).toEqual({ builds: [], reason: 'GitHub answered 503' })
  })

  it('refuses a request without a token', async () => {
    const { status } = await call('Bearer nope')

    expect(status).toBe(401)
  })
})
