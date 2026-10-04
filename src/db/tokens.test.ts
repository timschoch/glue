import { describe, expect, it } from 'vitest'

import {
  createToken,
  deleteToken,
  findProductByToken,
  listTokens,
} from './tokens.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

describe('createToken', () => {
  it('creates the Product when it does not exist yet', async () => {
    const { token } = await createToken(db, 'flexibeck', 'orchestrator')

    expect(await findProductByToken(db, token)).toBe('flexibeck')
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

describe('findProductByToken', () => {
  it('finds nothing for an unknown token', async () => {
    await createToken(db, 'flexibeck', 'orchestrator')

    expect(await findProductByToken(db, 'glue_unknown')).toBeUndefined()
  })
})

describe('listTokens', () => {
  it('lists each token with its Product and name, without the token', async () => {
    const { id } = await createToken(db, 'flexibeck', 'orchestrator')

    const tokens = await listTokens(db)
    expect(tokens).toEqual([
      {
        id,
        product: 'flexibeck',
        name: 'orchestrator',
        createdAt: expect.any(Date),
      },
    ])
  })
})

describe('deleteToken', () => {
  it('revokes the token', async () => {
    const { id, token } = await createToken(db, 'flexibeck', 'orchestrator')

    expect(await deleteToken(db, id)).toBe(true)
    expect(await findProductByToken(db, token)).toBeUndefined()
    expect(await listTokens(db)).toEqual([])
  })

  it('reports a token id that does not exist', async () => {
    expect(await deleteToken(db, 99)).toBe(false)
  })
})
