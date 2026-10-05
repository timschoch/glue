import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeGithub } from '../test/github.ts'
import { joinProject, listAssignments, watch } from './members.ts'
import { createPartOperations } from './part-operations.ts'
import { addProject } from './part-records.ts'
import { listMine, listWatched } from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const project = 'glue'
const tim = 'tim@example.com'
const ada = 'ada@example.com'

const goal = {
  type: 'goal' as const,
  title: 'Ship faster',
  metric: 'lead time',
  source: 'okr',
}

let operations: ReturnType<typeof createPartOperations>

// Tim is member 1 of glue, Ada is member 2.
beforeEach(async () => {
  operations = createPartOperations({ db, github: createFakeGithub().github })
  await addProject(db, project)
  await joinProject(db, project, { id: 'user-tim', name: 'Tim', email: tim })
  await joinProject(db, project, { id: 'user-ada', name: 'Ada', email: ada })
})

describe('the owner of a new Part', () => {
  it('is the member who adds it', async () => {
    await operations.addPart(project, goal, tim)

    expect(await listAssignments(db, project)).toEqual([
      { id: 1, memberId: 1, role: 'responsible', concept: null, part: 'G1' },
    ])
  })

  it('is the member that the Part names', async () => {
    await operations.addPart(project, { ...goal, responsible: ada }, tim)

    expect(await listAssignments(db, project)).toEqual([
      { id: 1, memberId: 2, role: 'responsible', concept: null, part: 'G1' },
    ])
  })

  it('is nobody when no member adds the Part', async () => {
    await operations.addPart(project, goal)

    expect(await listAssignments(db, project)).toEqual([])
  })

  it('must be a member of the Project', async () => {
    await expect(
      operations.addPart(project, { ...goal, responsible: 'bo@example.com' }),
    ).rejects.toThrow('bo@example.com is no member of glue.')
    await expect(operations.getPart(project, 'G1')).rejects.toThrow(
      'goal "G1" not found',
    )
  })
})

// Tim owns the Insight I1 and the Entity E1. E1 is published and needs I1.
// I1 gets a new title, so E1 has a flag. Ada watches E1.
describe('a Part with a flag that a member watches', () => {
  beforeEach(async () => {
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
    await operations.updatePart(project, 'I1', {
      title: 'Bakers start at three',
    })
    await watch(db, project, { member: ada, part: 'E1' })
  })

  it('refuses the answer of the watcher, and takes the one of the owner', async () => {
    await expect(
      operations.answerPart(project, 'E1', { answer: 'fine' }, ada),
    ).rejects.toThrow('"E1" has a flag: only its owner Tim answers it')
    expect(await operations.getPart(project, 'E1')).toMatchObject({
      workState: 'to-check',
      trust: 'flagged',
    })

    await operations.answerPart(project, 'E1', { answer: 'fine' }, tim)

    expect(await operations.getPart(project, 'E1')).toMatchObject({
      workState: 'published',
      trust: 'solid',
      flags: [],
    })
  })

  it('shows in Mine of the owner, and in the watched group of the watcher with its flag', async () => {
    const mine = async (member: string) =>
      (await listMine(db, project, member)).map(({ id }) => id)

    expect(await mine(tim)).toEqual(['E1'])
    expect(await mine(ada)).toEqual([])
    expect(await listWatched(db, project, tim)).toEqual([])
    expect(await listWatched(db, project, ada)).toMatchObject([
      {
        id: 'E1',
        type: 'entity',
        title: 'Shift',
        trust: 'flagged',
        workState: 'to-check',
        flags: [
          {
            cause: { id: 'I1', title: 'Bakers start at three' },
            reason: 'changed',
          },
        ],
      },
    ])
  })

  it('leaves a Part that the watcher holds out of the watched group', async () => {
    await watch(db, project, { member: tim, part: 'E1' })

    expect(await listWatched(db, project, tim)).toEqual([])
  })

  it('leaves a Part of nobody that Mine lists out of the watched group', async () => {
    await operations.addPart(project, goal)
    await watch(db, project, { member: ada, part: 'G1' })

    expect((await listMine(db, project, ada)).map(({ id }) => id)).toEqual([
      'G1',
    ])
    expect((await listWatched(db, project, ada)).map(({ id }) => id)).toEqual([
      'E1',
    ])
  })
})
