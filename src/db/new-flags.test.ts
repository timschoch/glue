import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeGithub } from '../test/github.ts'
import { joinProject } from './members.ts'
import { getNewFlagCount, setFlagsSeen } from './new-flags.ts'
import { createPartOperations } from './part-operations.ts'
import { addProject } from './part-records.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const project = 'glue'
const tim = 'tim@example.com'
const ada = 'ada@example.com'

let operations: ReturnType<typeof createPartOperations>

// Tim and Ada are members of glue. Tim owns the Insight I1 and the Entity
// E1. E1 is published and needs I1. I1 gets a new title, so E1 has one flag.
beforeEach(async () => {
  operations = createPartOperations({ db, github: createFakeGithub().github })
  await addProject(db, project)
  await joinProject(db, project, { id: 'user-tim', name: 'Tim', email: tim })
  await joinProject(db, project, { id: 'user-ada', name: 'Ada', email: ada })
  await operations.addPart(
    project,
    { type: 'insight', title: 'Bakers start at four', source: 'interview' },
    tim,
  )
  await operations.addPart(
    project,
    { type: 'entity', title: 'Shift', needs: ['I1'] },
    tim,
  )
  await operations.answerPart(project, 'E1', { answer: 'supersede' }, tim)
  await operations.updatePart(project, 'I1', { title: 'Bakers start at three' })
})

describe('the count of new flags of a member', () => {
  it('has each open flag of a Part that the member owns, and no flag of another owner', async () => {
    expect(await getNewFlagCount(db, project, tim)).toBe(1)
    expect(await getNewFlagCount(db, project, ada)).toBe(0)
  })

  it('has no flag that the member saw', async () => {
    await setFlagsSeen(db, project, tim)

    expect(await getNewFlagCount(db, project, tim)).toBe(0)
  })

  it('keeps the flag for the owner when another member looks', async () => {
    await setFlagsSeen(db, project, ada)

    expect(await getNewFlagCount(db, project, tim)).toBe(1)
  })

  it('has a new reason on a flag that the member saw', async () => {
    await setFlagsSeen(db, project, tim)

    await operations.answerPart(project, 'I1', { answer: 'not-ready' }, tim)

    expect((await operations.getPart(project, 'E1')).flags).toMatchObject([
      { cause: { id: 'I1' }, reason: 'changed' },
      { cause: { id: 'I1' }, reason: 'not-ready' },
    ])
    expect(await getNewFlagCount(db, project, tim)).toBe(1)
  })

  it('has no flag when a reason that the member saw comes again', async () => {
    await setFlagsSeen(db, project, tim)

    await operations.updatePart(project, 'I1', { title: 'Bakers start at two' })

    expect((await operations.getPart(project, 'E1')).flags).toMatchObject([
      { cause: { id: 'I1', title: 'Bakers start at two' }, reason: 'changed' },
    ])
    expect(await getNewFlagCount(db, project, tim)).toBe(0)
  })

  it('has no flag of a Part that waits, and has it when the Part is to check again', async () => {
    await operations.answerPart(
      project,
      'E1',
      { answer: 'wait', waitsOn: 'I1' },
      tim,
    )

    expect(await getNewFlagCount(db, project, tim)).toBe(0)

    await operations.updatePart(project, 'I1', { title: 'Bakers start at two' })

    expect(await getNewFlagCount(db, project, tim)).toBe(1)
  })

  it('has the flag of a Part with no owner for each member', async () => {
    await operations.addPart(project, {
      type: 'entity',
      title: 'Oven',
      needs: ['I1'],
    })
    await operations.answerPart(project, 'E2', { answer: 'supersede' })
    await operations.updatePart(project, 'I1', { title: 'Bakers start at two' })

    expect(await getNewFlagCount(db, project, tim)).toBe(2)
    expect(await getNewFlagCount(db, project, ada)).toBe(1)
  })

  it('is zero for a person who is no member of the Project', async () => {
    expect(await getNewFlagCount(db, project, 'bo@example.com')).toBe(0)
  })
})
