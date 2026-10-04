import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { findContract, findContractState, signContract } from './contracts.ts'
import {
  addConcept,
  addPart,
  addProject,
  answerPart,
  updatePart,
} from './part-records.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// The Project glue holds the Brief `videos`, which holds the Concept `player`.
// `videos` has the Insight I1, the Decision D1 and the Flow F1. `player` has
// the Entity E1. F1 and E1 start as drafts.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  await addProject(db, 'glue')
  await addConcept(db, 'glue', {
    slug: 'videos',
    title: 'Technique videos',
    kind: 'brief',
  })
  await addConcept(db, 'glue', {
    slug: 'player',
    title: 'Player',
    parent: 'videos',
  })
  await addPart(db, 'glue', {
    type: 'goal',
    title: 'First bake feels easy',
    metric: 'ease',
    source: 'okr',
  })
  await addPart(db, 'glue', {
    type: 'insight',
    concept: 'videos',
    title: 'Bakers want step videos',
    source: 'interview',
    date: '2026-10-01',
  })
  await addPart(db, 'glue', {
    type: 'decision',
    concept: 'videos',
    title: 'Show the video of the creator',
    owner: 'Tim',
    date: '2026-10-02',
    status: 'accepted',
    needs: ['G1', 'I1'],
  })
  await addPart(db, 'glue', {
    type: 'flow',
    concept: 'videos',
    title: 'Watch a technique',
    needs: ['D1'],
  })
  await addPart(db, 'glue', {
    type: 'entity',
    concept: 'player',
    title: 'Technique',
  })
})

afterAll(async () => {
  await client.close()
})

function publish(...recordIds: string[]) {
  return recordIds.reduce(
    (done, recordId) =>
      done.then(() =>
        answerPart(db, 'glue', recordId, { answer: 'supersede' }),
      ),
    Promise.resolve(),
  )
}

describe('signContract', () => {
  it('names the Parts that are not solid, also in a nested Concept, and freezes nothing', async () => {
    await expect(signContract(db, 'glue', 'videos', 'Tim')).rejects.toThrow(
      'sign-off needs Trust solid: F1, E1',
    )

    const state = await findContractState(db, 'glue', 'videos')
    expect(state?.versions).toEqual([])
    expect(state?.blocking.map(({ id }) => id)).toEqual(['F1', 'E1'])
    expect(state?.ahead).toBe(false)
  })

  it('freezes Version 1 with a checksum when each Part is solid', async () => {
    await publish('F1', 'E1')

    expect(await signContract(db, 'glue', 'videos', 'Tim')).toBe(1)

    const contract = await findContract(db, 'glue', 'videos')
    expect(contract).toMatchObject({
      concept: 'videos',
      title: 'Technique videos',
      kind: 'brief',
      version: 1,
      newestVersion: 1,
      signedBy: 'Tim',
    })
    expect(contract?.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(contract?.tier1).toEqual([
      expect.objectContaining({
        id: 'F1',
        type: 'flow',
        title: 'Watch a technique',
        concept: 'videos',
        needs: ['D1'],
      }),
      expect.objectContaining({ id: 'E1', type: 'entity', concept: 'player' }),
    ])
    expect(contract?.tier2.map(({ id }) => id)).toEqual(['I1', 'D1'])
  })

  it('says which slots of a Brief are empty', async () => {
    await publish('F1', 'E1')
    await signContract(db, 'glue', 'videos', 'Tim')

    const contract = await findContract(db, 'glue', 'videos')

    expect(contract?.slots).toEqual([
      { type: 'insight', filled: true },
      { type: 'goal', filled: false },
      { type: 'decision', filled: true },
      { type: 'metric', filled: false },
      { type: 'flow', filled: true },
      { type: 'entity', filled: true },
      { type: 'guardrail', filled: false },
    ])
  })

  it('refuses a second sign-off of a Concept that did not change', async () => {
    await publish('F1', 'E1')
    await signContract(db, 'glue', 'videos', 'Tim')

    await expect(signContract(db, 'glue', 'videos', 'Tim')).rejects.toThrow(
      '"videos" did not change since Version 1',
    )
  })

  it('leaves a sunk Part out: it blocks nothing and is not frozen', async () => {
    await publish('E1')
    await answerPart(db, 'glue', 'F1', { answer: 'sink' })

    await signContract(db, 'glue', 'videos', 'Tim')

    const contract = await findContract(db, 'glue', 'videos')
    expect(contract?.tier1.map(({ id }) => id)).toEqual(['E1'])
  })

  it('refuses a Concept that the Project does not have', async () => {
    await expect(signContract(db, 'glue', 'nope', 'Tim')).rejects.toThrow(
      'concept "nope" not found',
    )
  })
})

describe('a Concept that changed after its Contract Version', () => {
  beforeEach(async () => {
    await publish('F1', 'E1')
    await signContract(db, 'glue', 'videos', 'Tim')
    await updatePart(db, 'glue', 'E1', { title: 'Baking technique' })
  })

  it('is ahead of its Contract', async () => {
    const state = await findContractState(db, 'glue', 'videos')

    expect(state?.ahead).toBe(true)
    expect(state?.versions.map(({ version }) => version)).toEqual([1])
  })

  it('keeps the frozen Version as it was, and the next sign-off adds Version 2', async () => {
    expect(await signContract(db, 'glue', 'videos', 'Ada')).toBe(2)

    const state = await findContractState(db, 'glue', 'videos')
    expect(state?.ahead).toBe(false)
    expect(
      state?.versions.map(({ version, signedBy }) => [version, signedBy]),
    ).toEqual([
      [2, 'Ada'],
      [1, 'Tim'],
    ])
    expect(state?.versions[0].checksum).not.toBe(state?.versions[1].checksum)

    const newest = await findContract(db, 'glue', 'videos')
    expect(newest?.version).toBe(2)
    expect(newest?.tier1[1].title).toBe('Baking technique')

    const first = await findContract(db, 'glue', 'videos', 1)
    expect(first).toMatchObject({ version: 1, newestVersion: 2 })
    expect(first?.tier1[1].title).toBe('Technique')
  })
})

describe('findContract', () => {
  it('finds nothing for a Concept without a Contract Version', async () => {
    expect(await findContract(db, 'glue', 'videos')).toBeUndefined()
    expect(await findContract(db, 'glue', 'nope')).toBeUndefined()
    expect(await findContractState(db, 'glue', 'nope')).toBeUndefined()
  })
})
