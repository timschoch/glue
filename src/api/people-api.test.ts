import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { joinProject } from '../db/members.ts'
import { addPart } from '../db/part-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import type { ApiRequest } from './api-request.ts'
import { handleListMine } from './part-api.ts'
import {
  handleAddMember,
  handleAssign,
  handleListAssignments,
  handleListMembers,
  handleListWatchers,
  handleUnassign,
  handleUnwatch,
  handleWatch,
} from './people-api.ts'

const { client, db } = createTestDatabase(schema)
let token: string

beforeAll(async () => {
  await client.exec(`
    create schema neon_auth;
    create table neon_auth."user" (id uuid primary key, name text not null, email text not null);
    insert into neon_auth."user" (id, name, email) values
      ('00000000-0000-0000-0000-000000000002', 'Bo', 'bo@example.com');
  `)
})

// The Project flexibeck has the Goal G1 and the Guardrail R1 in its root
// Concept. Ada is its member. Bo has an account and is no member.
beforeEach(async () => {
  ;({ token } = await createToken(db, 'flexibeck', 'orchestrator'))
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
  await joinProject(db, 'flexibeck', {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
  })
})

type Call = { body?: unknown; query?: string; token?: string | null }

async function call(
  handler: (input: ApiRequest) => Promise<Response>,
  method: string,
  options: Call = {},
) {
  const { body, query = '' } = options
  const sent = options.token === undefined ? token : options.token
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  const response = await handler({
    db,
    request: new Request(`http://localhost/api/v1${query}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { project: 'flexibeck' },
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : undefined }
}

const responsible = {
  member: 'ada@example.com',
  role: 'responsible',
  part: 'G1',
}

const watcher = { member: 'ada@example.com', part: 'G1' }

describe('the people routes without a token', () => {
  it.each([
    ['GET members', handleListMembers, 'GET', undefined],
    ['POST members', handleAddMember, 'POST', { email: 'bo@example.com' }],
    ['GET assignments', handleListAssignments, 'GET', undefined],
    ['POST assignments', handleAssign, 'POST', responsible],
    ['DELETE assignments', handleUnassign, 'DELETE', undefined],
    ['GET watchers', handleListWatchers, 'GET', undefined],
    ['POST watchers', handleWatch, 'POST', watcher],
    ['DELETE watchers', handleUnwatch, 'DELETE', undefined],
  ] as const)('%s answers 401', async (_name, handler, method, body) => {
    const response = await call(handler, method, { body, token: null })

    expect(response.status).toBe(401)
  })
})

describe('members', () => {
  it('lists the members of the Project', async () => {
    const response = await call(handleListMembers, 'GET')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        id: 1,
        userId: 'user-1',
        name: 'Ada',
        email: 'ada@example.com',
        loopSteps: [],
      },
    ])
  })

  it('adds the account of an e-mail address as a member', async () => {
    const response = await call(handleAddMember, 'POST', {
      body: { email: 'bo@example.com' },
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: 2, name: 'Bo' })
  })

  it('answers 400 for an e-mail address without an account', async () => {
    const response = await call(handleAddMember, 'POST', {
      body: { email: 'nobody@example.com' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe(
      'No account has the e-mail address nobody@example.com.',
    )
  })
})

describe('assignments', () => {
  it('makes a member Responsible, lists it, and takes it back', async () => {
    const added = await call(handleAssign, 'POST', { body: responsible })
    const listed = await call(handleListAssignments, 'GET')
    const removed = await call(handleUnassign, 'DELETE', {
      query: '?member=ada@example.com&part=G1',
    })

    const assignment = {
      id: 1,
      memberId: 1,
      role: 'responsible',
      concept: null,
      part: 'G1',
    }
    expect(added.status).toBe(201)
    expect(added.body).toEqual([assignment])
    expect(listed.body).toEqual([assignment])
    expect(removed.status).toBe(204)
    expect((await call(handleListAssignments, 'GET')).body).toEqual([])
  })

  it('answers 400 for a role that does not exist and for a Part that does not exist', async () => {
    const role = await call(handleAssign, 'POST', {
      body: { ...responsible, role: 'boss' },
    })
    const part = await call(handleAssign, 'POST', {
      body: { ...responsible, part: 'G9' },
    })

    expect(role.status).toBe(400)
    expect(part.status).toBe(400)
    expect(part.body.error.message).toBe('G9 not found')
  })
})

describe('watchers', () => {
  it('makes a member a watcher of a Part, lists the watchers, and takes one back', async () => {
    const added = await call(handleWatch, 'POST', { body: watcher })
    await call(handleWatch, 'POST', {
      body: { member: 'ada@example.com', part: 'R1' },
    })
    const ofPart = await call(handleListWatchers, 'GET', { query: '?part=G1' })
    const removed = await call(handleUnwatch, 'DELETE', {
      query: '?member=ada@example.com&part=G1',
    })

    expect(added.status).toBe(201)
    expect(added.body).toEqual([{ memberId: 1, part: 'G1' }])
    expect(ofPart.body).toEqual([{ memberId: 1, part: 'G1' }])
    expect(removed.status).toBe(204)
    expect((await call(handleListWatchers, 'GET')).body).toEqual([
      { memberId: 1, part: 'R1' },
    ])
  })

  it('answers 400 for a Part that does not exist', async () => {
    const response = await call(handleWatch, 'POST', {
      body: { ...watcher, part: 'G9' },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('G9 not found')
  })
})

describe('GET mine of a member', () => {
  it('lists the Parts of the member and the Parts of nobody', async () => {
    await call(handleAddMember, 'POST', { body: { email: 'bo@example.com' } })
    await call(handleAssign, 'POST', { body: responsible })

    const ids = async (query: string) =>
      (await call(handleListMine, 'GET', { query })).body.map(
        (part: { id: string }) => part.id,
      )

    expect(await ids('?member=ada@example.com')).toEqual(['R1', 'G1'])
    expect(await ids('?member=bo@example.com')).toEqual(['R1'])
    expect(await ids('')).toEqual(['R1', 'G1'])
  })
})
