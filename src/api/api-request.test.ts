import { beforeEach, describe, expect, it } from 'vitest'

import { addProject } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import { handleApiRequest, parseJson } from './api-request.ts'

const { db } = createTestDatabase(schema)
let token: string

beforeEach(async () => {
  await addProject(db, 'flexibeck')
  ;({ token } = await createToken(db, 'flexibeck', 'orchestrator'))
})

// Answers 200 with the JSON body of the request.
async function call(authorization: string, body: string) {
  const request = new Request('http://localhost/api/v1', {
    method: 'POST',
    headers: { authorization },
    body,
  })
  const response = await handleApiRequest(
    { db, request, params: { project: 'flexibeck' } },
    async () => Response.json(await parseJson(request)),
  )
  return { status: response.status, body: await response.json() }
}

describe('handleApiRequest', () => {
  it('answers 401 with a wrong token', async () => {
    const response = await call('Bearer glue_wrong', '{}')

    expect(response).toEqual({
      status: 401,
      body: { error: { code: 'unauthorized', message: expect.any(String) } },
    })
  })

  it('accepts the Bearer scheme in any case, RFC 7235', async () => {
    const response = await call(`bearer ${token}`, '{"title":"Cart"}')

    expect(response).toEqual({ status: 200, body: { title: 'Cart' } })
  })

  it('answers 400 for a body that is not JSON', async () => {
    const response = await call(`Bearer ${token}`, '{')

    expect(response).toEqual({
      status: 400,
      body: {
        error: { code: 'invalid-request', message: 'the body is not JSON' },
      },
    })
  })
})
