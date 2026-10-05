import { beforeEach, describe, expect, it } from 'vitest'

import { signContract } from './contracts.ts'
import {
  addConcept,
  addJoint,
  addPart,
  addProject,
  answerPart,
  updatePart,
} from './part-records.ts'
import { findPart } from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

function publish(recordId: string) {
  return answerPart(db, 'glue', recordId, { answer: 'supersede' })
}

async function readNeeds(recordId: string) {
  const part = await findPart(db, 'glue', recordId)
  return part?.needs.map(({ part: needed, contractVersion }) => [
    needed.id,
    contractVersion,
  ])
}

// The Project glue holds the Concepts `videos` and `shop`. `videos` has the
// published Entities E1 and E2. `shop` has the published Flow F1.
beforeEach(async () => {
  await addProject(db, 'glue')
  await addConcept(db, 'glue', { slug: 'videos', title: 'Technique videos' })
  await addConcept(db, 'glue', { slug: 'shop', title: 'Shop' })
  await addPart(db, 'glue', {
    type: 'entity',
    concept: 'videos',
    title: 'Technique',
  })
  await addPart(db, 'glue', {
    type: 'entity',
    concept: 'videos',
    title: 'Creator',
  })
  await addPart(db, 'glue', {
    type: 'flow',
    concept: 'shop',
    title: 'Buy a course',
  })
  await publish('E1')
  await publish('E2')
  await publish('F1')
})

describe('a Joint to a Part of a different Concept', () => {
  it('takes the newest Contract Version of that Concept', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')

    await addJoint(db, 'glue', { part: 'F1', needs: 'E1' })
    await addPart(db, 'glue', {
      type: 'flow',
      concept: 'shop',
      title: 'Watch a preview',
      needs: ['E2'],
      body: 'It shows #E1.',
    })

    expect(await readNeeds('F1')).toEqual([['E1', 1]])
    expect(await readNeeds('F2')).toEqual([
      ['E2', 1],
      ['E1', 1],
    ])
  })

  it('has no Version when the Concept has no Contract', async () => {
    await addJoint(db, 'glue', { part: 'F1', needs: 'E1' })

    expect(await readNeeds('F1')).toEqual([['E1', null]])
  })
})

describe('a Joint inside one Concept', () => {
  it('has no Version', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')

    await addJoint(db, 'glue', { part: 'E2', needs: 'E1' })

    expect(await readNeeds('E2')).toEqual([['E1', null]])
  })
})

describe('the sign-off of a new Contract Version', () => {
  // F1 needs E1 and F2 needs E2, both with Version 1. Then E1 gets a new
  // title, and the owner of F1 says that the live change is fine.
  beforeEach(async () => {
    await signContract(db, 'glue', 'videos', 'Tim')
    await addJoint(db, 'glue', { part: 'F1', needs: 'E1' })
    await addPart(db, 'glue', {
      type: 'flow',
      concept: 'shop',
      title: 'Watch a preview',
      needs: ['E2'],
    })
    await publish('F2')
    await updatePart(db, 'glue', 'E1', { title: 'Baking technique' })
    await answerPart(db, 'glue', 'F1', { answer: 'fine' })
  })

  it('flags the Part that was glued with the older Version, with what changed', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')

    const part = await findPart(db, 'glue', 'F1')
    expect(part).toMatchObject({ trust: 'flagged', workState: 'to-check' })
    expect(
      part?.flags.map(({ cause, reason, contract }) => ({
        cause: cause.id,
        reason,
        contract,
      })),
    ).toEqual([
      {
        cause: 'E1',
        reason: 'new-version',
        contract: {
          concept: 'videos',
          builtWith: 1,
          newest: 2,
          changes: [
            { field: 'title', before: 'Technique', after: 'Baking technique' },
          ],
        },
      },
    ])
  })

  it('flags no Part whose needed Part is the same in both Versions', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')

    const part = await findPart(db, 'glue', 'F2')
    expect(part).toMatchObject({ trust: 'solid', workState: 'published' })
    expect(part?.flags).toEqual([])
  })

  it('flags no Part of the same Concept', async () => {
    await addJoint(db, 'glue', { part: 'E2', needs: 'E1' })

    await signContract(db, 'glue', 'videos', 'Tim')

    expect((await findPart(db, 'glue', 'E2'))?.flags).toEqual([])
  })

  it('moves the Joint to the Version and clears the flag with the answer', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')

    await answerPart(db, 'glue', 'F1', {
      answer: 'move-to-version',
      needs: 'E1',
      version: 2,
    })

    const part = await findPart(db, 'glue', 'F1')
    expect(part).toMatchObject({ trust: 'solid', workState: 'published' })
    expect(part?.flags).toEqual([])
    expect(await readNeeds('F1')).toEqual([['E1', 2]])
  })

  it('refuses a Version that is not the newest one', async () => {
    await signContract(db, 'glue', 'videos', 'Tim')

    await expect(
      answerPart(db, 'glue', 'F1', {
        answer: 'move-to-version',
        needs: 'E1',
        version: 1,
      }),
    ).rejects.toThrow('"F1" has no flag of Version 1 of "E1"')
  })
})

describe('a Joint with no Version', () => {
  it('gets no flag of a new Contract Version', async () => {
    await addJoint(db, 'glue', { part: 'F1', needs: 'E1' })
    await signContract(db, 'glue', 'videos', 'Tim')
    await updatePart(db, 'glue', 'E1', { title: 'Baking technique' })
    await answerPart(db, 'glue', 'F1', { answer: 'fine' })

    await signContract(db, 'glue', 'videos', 'Tim')

    expect((await findPart(db, 'glue', 'F1'))?.flags).toEqual([])
    expect(await readNeeds('F1')).toEqual([['E1', null]])
  })
})
