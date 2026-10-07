import { beforeEach, describe, expect, it } from 'vitest'

import type { ApiRequest } from './api-request.ts'
import { addProject } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import {
  handleAddSignalFilter,
  handleListSignalFilters,
  handleRemoveSignalFilter,
  handleUpdateSignalFilter,
} from './signal-filter-api.ts'

const { db } = createTestDatabase(schema)

let token: string

beforeEach(async () => {
  await addProject(db, 'glue')
  ;({ token } = await createToken(db, 'glue', 'orchestrator'))
})

type Handler = (input: ApiRequest) => Promise<Response>

async function call(
  handler: Handler,
  method: string,
  options: { filterId?: string; body?: unknown } = {},
  sent: string | null = token,
) {
  const { filterId, body } = options
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  const response = await handler({
    db,
    request: new Request('http://localhost/api/v1', {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'glue', filterId },
  })
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  }
}

const slowLists = {
  id: 1,
  name: 'Slow lists',
  mustHold: ['slow'],
  mustNotHold: ['phone'],
  sources: ['github'],
}

const add = (body: unknown = slowLists, sent?: string | null) =>
  call(handleAddSignalFilter, 'POST', { body }, sent)

const list = () => call(handleListSignalFilters, 'GET')

describe('POST a filter of the Signals of a Project', () => {
  it('answers the saved filter, and the list holds it', async () => {
    const { id: _id, ...input } = slowLists

    expect(await add(input)).toEqual({ status: 201, body: slowLists })
    expect(await list()).toEqual({ status: 200, body: [slowLists] })
  })

  it('answers 400 for a filter with no word and no source', async () => {
    const { status, body } = await add({ name: 'All' })

    expect(status).toBe(400)
    expect(body.error.message).toContain('A filter needs a word or a source')
  })

  it('answers 401 without a token', async () => {
    expect((await add(slowLists, null)).status).toBe(401)
  })
})

describe('PATCH a filter', () => {
  it('answers the changed filter', async () => {
    await add({ name: 'Slow lists', mustHold: ['slow'] })
    const changed = {
      id: 1,
      name: 'Market',
      mustHold: [],
      mustNotHold: [],
      sources: ['market'],
    }

    const response = await call(handleUpdateSignalFilter, 'PATCH', {
      filterId: '1',
      body: { name: 'Market', sources: ['market'] },
    })

    expect(response).toEqual({ status: 200, body: changed })
    expect(await list()).toEqual({ status: 200, body: [changed] })
  })

  it.each(['2', 'first'])('answers 404 for the id %s', async (filterId) => {
    await add({ name: 'Slow lists', mustHold: ['slow'] })

    const { status } = await call(handleUpdateSignalFilter, 'PATCH', {
      filterId,
      body: { name: 'Market', sources: ['market'] },
    })

    expect(status).toBe(404)
  })
})

describe('DELETE a filter', () => {
  it('deletes the filter', async () => {
    await add({ name: 'Slow lists', mustHold: ['slow'] })

    const response = await call(handleRemoveSignalFilter, 'DELETE', {
      filterId: '1',
    })

    expect(response).toEqual({ status: 204, body: null })
    expect(await list()).toEqual({ status: 200, body: [] })
  })

  it('answers 404 for a filter that the Project does not have', async () => {
    const { status } = await call(handleRemoveSignalFilter, 'DELETE', {
      filterId: '1',
    })

    expect(status).toBe(404)
  })
})

describe('a token of another Project', () => {
  it.each([
    ['add', handleAddSignalFilter, 'POST'],
    ['list', handleListSignalFilters, 'GET'],
    ['change', handleUpdateSignalFilter, 'PATCH'],
    ['delete', handleRemoveSignalFilter, 'DELETE'],
  ] as const)('gets 404 on %s', async (_name, handler, method) => {
    await add({ name: 'Slow lists', mustHold: ['slow'] })
    await addProject(db, 'flexibeck')
    const other = await createToken(db, 'flexibeck', 'other agent')

    const { status } = await call(
      handler,
      method,
      {
        filterId: '1',
        body:
          method === 'POST' || method === 'PATCH'
            ? { name: 'Spy', mustHold: ['x'] }
            : undefined,
      },
      other.token,
    )

    expect(status).toBe(404)
    expect((await list()).body).toHaveLength(1)
  })
})
