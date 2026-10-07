import { describe, expect, it } from 'vitest'

import { addAgent, joinProject } from './members.ts'
import { addProject } from './part-records.ts'
import { InvalidRecordError } from './record-errors.ts'
import { createToken, deleteToken, findToken, listTokens } from './tokens.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const ada = { id: 'user-ada', name: 'Ada', email: 'ada@example.com' }

describe('createToken', () => {
  it('creates the Product when it does not exist yet', async () => {
    const { token } = await createToken(db, 'flexibeck', 'orchestrator')

    expect(await findToken(db, token)).toEqual({
      project: 'flexibeck',
      member: null,
    })
  })

  it('gives the token to the member of the e-mail address', async () => {
    await addProject(db, 'flexibeck')
    await joinProject(db, 'flexibeck', ada)

    const { token } = await createToken(
      db,
      'flexibeck',
      'laptop',
      'Ada@example.com',
    )

    expect(await findToken(db, token)).toEqual({
      project: 'flexibeck',
      member: { name: 'Ada', email: 'ada@example.com' },
    })
  })

  it('gives the token to an agent, a member with no account', async () => {
    await addProject(db, 'flexibeck')
    const agent = await addAgent(db, 'flexibeck', 'Build Worker')

    const { token } = await createToken(db, 'flexibeck', 'ci', agent.email)

    expect(agent).toEqual({
      id: 1,
      userId: 'agent:build-worker',
      name: 'Build Worker',
      email: 'build-worker@agent.invalid',
      loopSteps: [],
    })
    expect(await findToken(db, token)).toEqual({
      project: 'flexibeck',
      member: { name: 'Build Worker', email: 'build-worker@agent.invalid' },
    })
  })

  it('refuses a member of another Project, and makes no token', async () => {
    await addProject(db, 'flexibeck')
    await addProject(db, 'glue')
    await joinProject(db, 'glue', ada)

    await expect(
      createToken(db, 'flexibeck', 'laptop', ada.email),
    ).rejects.toThrow(
      new InvalidRecordError('ada@example.com is no member of flexibeck.'),
    )
    expect(await listTokens(db)).toEqual([])
  })

  it('stores only the hash of the token', async () => {
    const { token } = await createToken(db, 'flexibeck', 'orchestrator')

    const rows = await db.select().from(schema.tokens)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('creates a different token each time', async () => {
    const first = await createToken(db, 'flexibeck', 'one')
    const second = await createToken(db, 'flexibeck', 'two')

    expect(first.token).not.toBe(second.token)
  })
})

describe('findToken', () => {
  it('finds nothing for an unknown token', async () => {
    await createToken(db, 'flexibeck', 'orchestrator')

    expect(await findToken(db, 'glue_unknown')).toBeUndefined()
  })
})

describe('listTokens', () => {
  it('lists each token with its Product, name and member, without the token', async () => {
    await addProject(db, 'flexibeck')
    await joinProject(db, 'flexibeck', ada)
    const first = await createToken(db, 'flexibeck', 'orchestrator')
    const second = await createToken(db, 'flexibeck', 'laptop', ada.email)

    const tokens = await listTokens(db)
    expect(tokens).toEqual([
      {
        id: first.id,
        product: 'flexibeck',
        name: 'orchestrator',
        member: null,
        createdAt: expect.any(Date),
      },
      {
        id: second.id,
        product: 'flexibeck',
        name: 'laptop',
        member: 'ada@example.com',
        createdAt: expect.any(Date),
      },
    ])
  })
})

describe('deleteToken', () => {
  it('revokes the token', async () => {
    const { id, token } = await createToken(db, 'flexibeck', 'orchestrator')

    expect(await deleteToken(db, id)).toBe(true)
    expect(await findToken(db, token)).toBeUndefined()
    expect(await listTokens(db)).toEqual([])
  })

  it('reports a token id that does not exist', async () => {
    expect(await deleteToken(db, 99)).toBe(false)
  })
})
