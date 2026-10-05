import { beforeEach, describe, expect, it } from 'vitest'

import {
  addJoint,
  addPart,
  addProject,
  answerPart,
  updatePart,
} from './part-records.ts'
import { findConcept, findPart } from './parts.ts'
import { addProjectReference } from './projects.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

// Project `glue-build` may reference Project `glue`. Each has a Flow F1:
// the one of `glue` is published. The Entity E1 of `glue` is a draft.
beforeEach(async () => {
  await addProject(db, 'glue', 'Glue')
  await addProject(db, 'glue-build', 'Build of Glue')
  await addProjectReference(db, 'glue-build', 'glue')
  await addPart(db, 'glue', { type: 'flow', title: 'Sign off a Version' })
  await answerPart(db, 'glue', 'F1', { answer: 'supersede' })
  await addPart(db, 'glue', { type: 'entity', title: 'Contract' })
  await addPart(db, 'glue-build', { type: 'flow', title: 'Merge gate' })
})

const reference = {
  jointId: 1,
  twoWay: false,
  link: true,
  project: { slug: 'glue', name: 'Glue' },
  part: {
    id: 'F1',
    type: 'flow',
    title: 'Sign off a Version',
    status: null,
    trust: 'solid',
    workState: 'published',
    concept: 'glue',
    conceptTitle: 'Glue',
  },
}

describe('a reference to a Part of another Project', () => {
  it('glues a Part to a published Part of the Project that its Project may reference, and reads it with that Project', async () => {
    const jointId = await addJoint(db, 'glue-build', {
      part: 'F1',
      needs: 'glue/F1',
    })

    expect(jointId).toBe(1)
    expect((await findPart(db, 'glue-build', 'F1'))?.needs).toEqual([reference])
  })

  it('does not list the Part of the other Project in the needed Part and in its Concept', async () => {
    await addJoint(db, 'glue-build', { part: 'F1', needs: 'glue/F1' })

    expect((await findPart(db, 'glue', 'F1'))?.neededBy).toEqual([])
    expect(await findConcept(db, 'glue', 'glue')).toMatchObject({
      linkedParts: [],
      joints: [],
    })
    expect(await findConcept(db, 'glue-build', 'glue-build')).toMatchObject({
      linkedParts: [],
      joints: [],
    })
  })

  it('refuses the other direction, and names both Projects', async () => {
    const refused = addJoint(db, 'glue', {
      part: 'F1',
      needs: 'glue-build/F1',
    })

    await expect(refused).rejects.toThrow(
      new InvalidRecordError(
        'a Part of Project "glue" cannot need a Part of Project "glue-build"',
      ),
    )
  })

  it('refuses a Part that is not published', async () => {
    const refused = addJoint(db, 'glue-build', {
      part: 'F1',
      needs: 'glue/E1',
    })

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('"glue/E1" is not published'),
    )
  })

  it('refuses a two-way reference', async () => {
    const refused = addJoint(db, 'glue-build', {
      part: 'F1',
      needs: 'glue/F1',
      twoWay: true,
    })

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('a reference goes one way'),
    )
  })

  it('takes a reference as a Part that a new Part needs', async () => {
    await addPart(db, 'glue-build', {
      type: 'flow',
      title: 'Release',
      needs: ['glue/F1'],
    })

    expect((await findPart(db, 'glue-build', 'F2'))?.needs).toEqual([reference])
  })

  it('glues a Part to the Part that its body names as #glue/F1', async () => {
    await addPart(db, 'glue-build', {
      type: 'flow',
      title: 'Release',
      body: 'It comes after #glue/F1 and after #glue/E1.',
    })

    expect((await findPart(db, 'glue-build', 'F2'))?.needs).toEqual([reference])
  })

  it('glues a Part to the Part that its new body names, and removes the Joint with the mention', async () => {
    await updatePart(db, 'glue-build', 'F1', { body: 'See #glue/F1.' })
    const named = await findPart(db, 'glue-build', 'F1')
    await updatePart(db, 'glue-build', 'F1', { body: 'See nothing.' })

    expect(named?.needs).toEqual([reference])
    expect((await findPart(db, 'glue-build', 'F1'))?.needs).toEqual([])
  })

  it('adds no Joint for a mention in the refused direction', async () => {
    await addPart(db, 'glue', {
      type: 'flow',
      title: 'Read a Signal',
      body: 'Not as in #glue-build/F1.',
    })

    expect((await findPart(db, 'glue', 'F2'))?.needs).toEqual([])
  })

  it('keeps the Trust of a Part when the Part that it references changes', async () => {
    await answerPart(db, 'glue-build', 'F1', { answer: 'supersede' })
    await addJoint(db, 'glue-build', { part: 'F1', needs: 'glue/F1' })

    await updatePart(db, 'glue', 'F1', { title: 'Sign off a Contract' })

    expect(await findPart(db, 'glue-build', 'F1')).toMatchObject({
      trust: 'solid',
      workState: 'published',
      flags: [],
      needs: [{ part: { title: 'Sign off a Contract' } }],
    })
  })
})
