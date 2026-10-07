import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeGithub } from '../test/github.ts'
import {
  assign,
  joinProject,
  listAssignments,
  listWatchers,
  unassign,
  watch,
} from './members.ts'
import { createPartOperations } from './part-operations.ts'
import { addProject } from './part-records.ts'
import { findPart, listMine, listWatched } from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const project = 'glue'
const tim = 'tim@example.com'
const ada = 'ada@example.com'
const bo = 'bo@example.com'

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

const decision = {
  type: 'decision' as const,
  title: 'Open at three',
  date: '2026-10-02',
  status: 'proposed' as const,
  needs: ['G1', 'I1'],
}

describe('the owner that a new Part names', () => {
  it('is the member with that name', async () => {
    await operations.addPart(project, { ...goal, owner: 'ada' }, tim)

    expect(await listAssignments(db, project)).toEqual([
      { id: 1, memberId: 2, role: 'responsible', concept: null, part: 'G1' },
    ])
  })

  it('is the member with that e-mail address', async () => {
    await operations.addPart(project, { ...goal, owner: 'ADA@example.com' })

    expect(await operations.getPart(project, 'G1')).toMatchObject({
      owner: 'Ada',
    })
  })

  it('must be a member, and the reason lists the members', async () => {
    await expect(
      operations.addPart(project, { ...goal, owner: 'Orchestrator' }, tim),
    ).rejects.toThrow(
      '"Orchestrator" names no member of glue. Its members: Ada <ada@example.com>, Tim <tim@example.com>',
    )
    await expect(operations.getPart(project, 'G1')).rejects.toThrow(
      'goal "G1" not found',
    )
  })
})

// The Goal G1 and the Insight I1 have no owner.
describe('the owner of a new Decision', () => {
  beforeEach(async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, {
      type: 'insight',
      title: 'Bakers start at four',
      source: 'interview',
    })
  })

  it('is the member who adds it', async () => {
    await operations.addPart(project, decision, tim)

    expect(await operations.getPart(project, 'D1')).toMatchObject({
      owner: 'Tim',
    })
  })

  it('is needed', async () => {
    await expect(operations.addPart(project, decision)).rejects.toThrow(
      'a Decision needs an owner: a member of glue',
    )
  })
})

describe('the owner that a change names', () => {
  beforeEach(async () => {
    await operations.addPart(project, goal, tim)
  })

  it('becomes the Responsible in the place of the old one', async () => {
    await operations.updatePart(project, 'G1', { owner: 'Ada' })

    expect(await listAssignments(db, project)).toEqual([
      { id: 2, memberId: 2, role: 'responsible', concept: null, part: 'G1' },
    ])
  })

  it('is the expected owner of a guarded write', async () => {
    await operations.updatePart(
      project,
      'G1',
      { title: 'Ship sooner' },
      { owner: 'Tim' },
    )

    expect(await operations.getPart(project, 'G1')).toMatchObject({
      title: 'Ship sooner',
    })
  })

  it('must be a member, and the reason lists the members', async () => {
    await expect(
      operations.updatePart(project, 'G1', { owner: 'Orchestrator' }),
    ).rejects.toThrow(
      '"Orchestrator" names no member of glue. Its members: Ada <ada@example.com>, Tim <tim@example.com>',
    )
    expect(await operations.getPart(project, 'G1')).toMatchObject({
      owner: 'Tim',
    })
  })
})

// A Part from before the Responsible was the owner has a name as text.
function setOldOwner(recordId: string, owner: string) {
  return db
    .update(schema.parts)
    .set({ owner })
    .where(eq(schema.parts.recordId, recordId))
}

describe('the owner that a Part shows', () => {
  it('is the name of its Responsible', async () => {
    await operations.addPart(project, goal, tim)

    expect(await operations.getPart(project, 'G1')).toMatchObject({
      owner: 'Tim',
    })
  })

  it('is the old text while the Part has no Responsible', async () => {
    await operations.addPart(project, goal)
    await setOldOwner('G1', 'Orchestrator')

    expect(await operations.getPart(project, 'G1')).toMatchObject({
      owner: 'Orchestrator',
    })
  })

  it('is the Responsible when a member takes a Part with an old text', async () => {
    await operations.addPart(project, goal)
    await setOldOwner('G1', 'Orchestrator')
    await assign(db, project, { member: ada, part: 'G1', role: 'responsible' })

    expect(await operations.getPart(project, 'G1')).toMatchObject({
      owner: 'Ada',
    })
  })
})

// Tim owns the Insight I1 and the Entity E1. E1 is published and needs I1 and
// the Decision D1, which has the Goal G1 and I1. Bo owns G1 and D1. I1
// gets a new title, so E1 has a flag. Ada watches E1.
describe('a Part with a flag that a member watches', () => {
  beforeEach(async () => {
    await operations.addPart(
      project,
      { type: 'insight', title: 'Bakers start at four', source: 'interview' },
      tim,
    )
    await joinProject(db, project, { id: 'user-bo', name: 'Bo', email: bo })
    await operations.addPart(project, goal, bo)
    await operations.addPart(
      project,
      {
        type: 'decision',
        title: 'Open at three',
        owner: 'Bo',
        date: '2026-10-02',
        status: 'accepted',
        needs: ['G1', 'I1'],
      },
      bo,
    )
    await operations.addPart(
      project,
      { type: 'entity', title: 'Shift', needs: ['I1', 'D1'] },
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

  it('refuses a change that names a new owner, from a member who is not the owner', async () => {
    await expect(
      operations.updatePart(project, 'E1', { owner: 'Ada' }, undefined, ada),
    ).rejects.toThrow('"E1" has a flag: only its owner Tim changes who has it')
    expect(await operations.getPart(project, 'E1')).toMatchObject({
      owner: 'Tim',
    })
  })

  it('refuses a member who is not the owner and takes it', async () => {
    await expect(
      assign(
        db,
        project,
        { member: ada, part: 'E1', role: 'responsible' },
        ada,
      ),
    ).rejects.toThrow('"E1" has a flag: only its owner Tim changes who has it')
  })

  it('lets each member take it when it has no owner', async () => {
    await unassign(db, project, { member: tim, part: 'E1' }, tim)

    await assign(
      db,
      project,
      { member: ada, part: 'E1', role: 'responsible' },
      ada,
    )

    expect(await operations.getPart(project, 'E1')).toMatchObject({
      owner: 'Ada',
      trust: 'flagged',
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

  it('gives the watcher no answer and the owner to ask, and the owner the answers', async () => {
    expect(await findPart(db, project, 'E1', ada)).toMatchObject({
      answers: [],
      answeredBy: { name: 'Tim', email: tim },
    })
    const own = await findPart(db, project, 'E1', tim)

    expect(own?.answers).toEqual([
      'fine',
      'wait',
      'need-time',
      'not-ready',
      'sink',
    ])
    expect(own?.answeredBy).toBeUndefined()
  })

  it('refuses the owner as a watcher', async () => {
    await expect(
      watch(db, project, { member: tim, part: 'E1' }),
    ).rejects.toThrow('tim@example.com owns "E1": the owner does not watch it')
    expect(await listWatchers(db, project, 'E1')).toEqual([
      { memberId: 2, part: 'E1' },
    ])
  })

  it('stops the watch of a watcher who becomes the owner', async () => {
    await assign(db, project, { member: ada, part: 'E1', role: 'responsible' })

    expect(await listWatchers(db, project, 'E1')).toEqual([])
  })

  it('leaves a Part that the watcher holds out of the watched group', async () => {
    await assign(db, project, { member: ada, part: 'E1', role: 'co-author' })

    expect(await listWatched(db, project, ada)).toEqual([])
  })

  it('leaves a Part of nobody that Mine lists out of the watched group', async () => {
    await operations.addPart(project, goal)
    await watch(db, project, { member: ada, part: 'G2' })

    expect((await listMine(db, project, ada)).map(({ id }) => id)).toEqual([
      'G2',
    ])
    expect((await listWatched(db, project, ada)).map(({ id }) => id)).toEqual([
      'E1',
    ])
  })
})
