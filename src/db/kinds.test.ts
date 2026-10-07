import { beforeEach, describe, expect, it } from 'vitest'

import { addKind, listKinds, updateKind } from './kinds.ts'
import { addProject } from './part-records.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

beforeEach(async () => {
  await addProject(db, 'bakeday', 'Bakeday')
})

describe('listKinds', () => {
  it('gives a new Project the Kind Brief, with a required slot for each Part type', async () => {
    expect(await listKinds(db, 'bakeday')).toEqual([
      {
        slug: 'brief',
        name: 'Brief',
        slots: [
          { type: 'insight', required: true, tier: 2, minCount: 1 },
          { type: 'goal', required: true, tier: 2, minCount: 1 },
          { type: 'decision', required: true, tier: 2, minCount: 1 },
          { type: 'metric', required: true, tier: 2, minCount: 1 },
          { type: 'flow', required: true, tier: 1, minCount: 1 },
          { type: 'entity', required: true, tier: 1, minCount: 1 },
          { type: 'guardrail', required: true, tier: 1, minCount: 1 },
        ],
      },
    ])
  })

  it('refuses a Project that does not exist', async () => {
    await expect(listKinds(db, 'nope')).rejects.toThrow(
      'product "nope" not found',
    )
  })
})

describe('addKind', () => {
  it('adds a Kind with its slots to the Project', async () => {
    const slug = await addKind(db, 'bakeday', {
      slug: 'prd',
      name: 'PRD',
      slots: [
        { type: 'flow', minCount: 2 },
        { type: 'goal' },
        { type: 'insight', required: false },
      ],
    })

    expect(slug).toBe('prd')
    expect(await listKinds(db, 'bakeday')).toEqual([
      expect.objectContaining({ slug: 'brief' }),
      {
        slug: 'prd',
        name: 'PRD',
        slots: [
          { type: 'insight', required: false, tier: 2, minCount: 1 },
          { type: 'goal', required: true, tier: 2, minCount: 1 },
          { type: 'flow', required: true, tier: 1, minCount: 2 },
        ],
      },
    ])
  })

  it('keeps the Kinds of two Projects apart', async () => {
    await addProject(db, 'ux', 'UX team')

    await addKind(db, 'bakeday', { slug: 'prd', name: 'PRD', slots: [] })

    expect((await listKinds(db, 'ux')).map(({ slug }) => slug)).toEqual([
      'brief',
    ])
  })

  it('refuses a Kind that the Project has already', async () => {
    await expect(
      addKind(db, 'bakeday', { slug: 'brief', name: 'Brief', slots: [] }),
    ).rejects.toThrow('kind "brief" exists already')
  })

  it('refuses two slots of one Part type', async () => {
    await expect(
      addKind(db, 'bakeday', {
        slug: 'prd',
        name: 'PRD',
        slots: [{ type: 'flow' }, { type: 'flow' }],
      }),
    ).rejects.toThrow('a Kind has one slot per Part type: flow')
  })

  it('refuses a slot that needs no Part', async () => {
    await expect(
      addKind(db, 'bakeday', {
        slug: 'prd',
        name: 'PRD',
        slots: [{ type: 'flow', minCount: 0 }],
      }),
    ).rejects.toThrow('minCount')
  })
})

describe('updateKind', () => {
  it('gives a Kind a new name and keeps its slots', async () => {
    await updateKind(db, 'bakeday', 'brief', { name: 'Short brief' })

    const [brief] = await listKinds(db, 'bakeday')
    expect(brief.name).toBe('Short brief')
    expect(brief.slots).toHaveLength(7)
  })

  it('puts the new slots in the place of the old ones', async () => {
    await updateKind(db, 'bakeday', 'brief', {
      slots: [{ type: 'decision' }, { type: 'flow', required: false }],
    })

    expect(await listKinds(db, 'bakeday')).toEqual([
      {
        slug: 'brief',
        name: 'Brief',
        slots: [
          { type: 'decision', required: true, tier: 2, minCount: 1 },
          { type: 'flow', required: false, tier: 1, minCount: 1 },
        ],
      },
    ])
  })

  it('refuses a Kind that the Project does not have', async () => {
    await expect(
      updateKind(db, 'bakeday', 'prd', { name: 'PRD' }),
    ).rejects.toThrow('kind "prd" not found')
  })

  it('refuses a change with no field', async () => {
    await expect(updateKind(db, 'bakeday', 'brief', {})).rejects.toThrow(
      'send at least one field',
    )
  })
})
