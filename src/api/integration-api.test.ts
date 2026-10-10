import { beforeEach, describe, expect, it } from 'vitest'

import { joinProject } from '../db/members.ts'
import { addProject } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import { TEAM_KEY, createFakeIntegrations } from '../test/integrations.ts'
import {
  handleAddIntegration,
  handleChangeIntegration,
  handleListIntegrations,
  handleRemoveIntegration,
} from './integration-api.ts'
import type { IntegrationRequest } from './integration-api.ts'

const { db } = createTestDatabase(schema)

const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }

// The token of the member Ada.
let token: string

beforeEach(async () => {
  await addProject(db, 'glue')
  await joinProject(db, 'glue', ada)
  ;({ token } = await createToken(db, 'glue', 'ada', ada.email))
})

type Handler = (input: IntegrationRequest) => Promise<Response>

async function call(
  handler: Handler,
  method: string,
  options: { integrationId?: string; body?: unknown } = {},
  sent: string | null = token,
) {
  const { integrationId, body } = options
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  const response = await handler({
    db,
    integrations: createFakeIntegrations(db),
    request: new Request('http://localhost/api/v1', {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'glue', integrationId },
  })
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  }
}

const input = { tool: 'github', address: 'acme/shop', key: TEAM_KEY }

const active = {
  id: 1,
  tool: 'github',
  address: 'acme/shop',
  keyLastFour: '1234',
  state: 'active',
  lastRead: { at: '2026-10-10T08:00:00.000Z', signalCount: 1, error: null },
}

const add = (body: unknown = input, sent?: string | null) =>
  call(handleAddIntegration, 'POST', { body }, sent)

const change = (state: string, integrationId = '1') =>
  call(handleChangeIntegration, 'PATCH', { integrationId, body: { state } })

const list = () => call(handleListIntegrations, 'GET')

describe('POST an Integration of a Project', () => {
  it('answers the saved Integration, and the list holds it', async () => {
    expect(await add()).toEqual({ status: 201, body: active })
    expect(await list()).toEqual({ status: 200, body: [active] })
  })

  it('answers 400 with the reason when the test read fails', async () => {
    const { status, body } = await add({ ...input, key: 'another-key' })

    expect(status).toBe(400)
    expect(body.error.message).toBe('GitHub refused the key')
    expect(await list()).toEqual({ status: 200, body: [] })
  })

  it('answers 401 without a token', async () => {
    expect((await add(input, null)).status).toBe(401)
  })
})

describe('the member of the token', () => {
  it('is the Responsible of the Integration that the token adds', async () => {
    await add()
    await db.update(schema.integrations).set({ state: 'failed' })

    const mine = await createFakeIntegrations(db).listMine('glue', ada.email)

    expect(mine).toEqual([{ ...active, state: 'failed' }])
  })
})

describe('PATCH an Integration', () => {
  it('pauses it, and starts it again', async () => {
    await add()

    const paused = await change('paused')
    const started = await change('active')

    expect(paused).toEqual({
      status: 200,
      body: { ...active, state: 'paused' },
    })
    expect(started).toEqual({ status: 200, body: active })
  })

  it('takes a new key, and answers 400 with the reason when the tool refuses it', async () => {
    await add({ ...input, key: TEAM_KEY })
    const setKey = (key: string) =>
      call(handleChangeIntegration, 'PATCH', {
        integrationId: '1',
        body: { key },
      })

    const refused = await setKey('another-key')
    const changed = await setKey(TEAM_KEY)

    expect(refused.status).toBe(400)
    expect(refused.body.error.message).toBe('GitHub refused the key')
    expect(changed).toEqual({ status: 200, body: active })
  })

  it('answers 400 for a state that no member sets', async () => {
    await add()

    expect((await change('failed')).status).toBe(400)
  })

  it.each(['2', 'first'])('answers 404 for the id %s', async (id) => {
    await add()

    expect((await change('paused', id)).status).toBe(404)
  })
})

describe('DELETE an Integration', () => {
  it('deletes the Integration', async () => {
    await add()

    const response = await call(handleRemoveIntegration, 'DELETE', {
      integrationId: '1',
    })

    expect(response).toEqual({ status: 204, body: null })
    expect(await list()).toEqual({ status: 200, body: [] })
  })

  it('answers 404 for an Integration that the Project does not have', async () => {
    const { status } = await call(handleRemoveIntegration, 'DELETE', {
      integrationId: '1',
    })

    expect(status).toBe(404)
  })
})

const writes = [
  ['add', handleAddIntegration, 'POST', input],
  ['change', handleChangeIntegration, 'PATCH', { state: 'paused' }],
  ['delete', handleRemoveIntegration, 'DELETE', undefined],
] as const

describe('a token of no member', () => {
  it.each(writes)('gets 401 on %s', async (_name, handler, method, body) => {
    await add()
    const agent = await createToken(db, 'glue', 'orchestrator')

    const { status } = await call(
      handler,
      method,
      { integrationId: '1', body },
      agent.token,
    )

    expect(status).toBe(401)
    expect(await list()).toEqual({ status: 200, body: [active] })
  })
})

describe('a token of another Project', () => {
  it.each([
    ...writes,
    ['list', handleListIntegrations, 'GET', undefined],
  ] as const)('gets 404 on %s', async (_name, handler, method, body) => {
    await add()
    await addProject(db, 'flexibeck')
    await joinProject(db, 'flexibeck', ada)
    const other = await createToken(db, 'flexibeck', 'ada', ada.email)

    const { status } = await call(
      handler,
      method,
      { integrationId: '1', body },
      other.token,
    )

    expect(status).toBe(404)
    expect(await list()).toEqual({ status: 200, body: [active] })
  })
})

describe('the answers', () => {
  it('give no key back, open or encrypted', async () => {
    const answers = JSON.stringify([
      await add(),
      await add({ ...input, address: 'acme/web', key: 'another-key' }),
      await change('paused'),
      await change('active'),
      await list(),
    ])
    const [{ encryptedKey }] = await db.select().from(schema.integrations)

    expect(answers).toContain('"keyLastFour":"1234"')
    expect(answers).not.toContain(TEAM_KEY)
    expect(answers).not.toContain('another-key')
    expect(answers).not.toContain(encryptedKey)
  })
})
