import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  addMember,
  assign,
  findMember,
  joinProject,
  listAssignments,
  listMembers,
  setLoopSteps,
  unassign,
} from './members.ts'
import { listMine } from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { client, db } = createTestDatabase(schema)

const tim = { id: 'user-tim', name: 'Tim', email: 'tim@example.com' }
const ada = { id: 'user-ada', name: 'Ada', email: 'ada@example.com' }

// Tim and Ada have an account.
beforeAll(async () => {
  await client.exec(`
    create schema neon_auth;
    create table neon_auth."user" (id uuid primary key default gen_random_uuid(), name text not null, email text not null);
    insert into neon_auth."user" (id, name, email) values
      ('00000000-0000-0000-0000-000000000001', 'Tim', 'tim@example.com'),
      ('00000000-0000-0000-0000-000000000002', 'Ada', 'ada@example.com');
  `)
})

// The Project glue has the root Concept glue and the Concept people in it.
// D1 and D2 are in people, I1 is in the root. All three are drafts.
// Tim is a member of glue.
beforeEach(async () => {
  await client.exec(`
    insert into projects (slug, name) values ('glue', 'Glue'), ('flexibeck', 'flexibeck');
    insert into concepts (project_id, parent_id, slug, title) values
      (1, null, 'glue', 'Glue'),
      (1, 1, 'people', 'People'),
      (2, null, 'flexibeck', 'flexibeck');
    insert into parts (project_id, concept_id, type, record_id, title, status, date, owner, work_state) values
      (1, 2, 'decision', 'D1', 'A Project has members', 'proposed', '2026-10-01', 'Tim', 'draft'),
      (1, 2, 'decision', 'D2', 'A member picks loop steps', 'proposed', '2026-10-02', 'Tim', 'draft');
    insert into parts (project_id, concept_id, type, record_id, title, date, source, evidence_level, work_state) values
      (1, 1, 'insight', 'I1', 'Open sign-up', '2026-10-03', 'review', 'pattern', 'draft');
  `)
  await joinProject(db, 'glue', tim)
})

describe('members', () => {
  it('lists the members of a Project', async () => {
    expect(await listMembers(db, 'glue')).toEqual([
      {
        id: 1,
        userId: 'user-tim',
        name: 'Tim',
        email: 'tim@example.com',
        loopSteps: [],
      },
    ])
    expect(await listMembers(db, 'flexibeck')).toEqual([])
  })

  it('adds a member by the e-mail address of an account', async () => {
    const member = await addMember(db, 'glue', 'Ada@example.com')

    expect(member).toEqual({
      id: 2,
      userId: '00000000-0000-0000-0000-000000000002',
      name: 'Ada',
      email: 'ada@example.com',
      loopSteps: [],
    })
    expect((await listMembers(db, 'glue')).map((row) => row.name)).toEqual([
      'Ada',
      'Tim',
    ])
  })

  it('refuses an e-mail address without an account', async () => {
    await expect(addMember(db, 'glue', 'nobody@example.com')).rejects.toThrow(
      'No account has the e-mail address nobody@example.com.',
    )
  })

  it('keeps one member for each account', async () => {
    await joinProject(db, 'glue', tim)

    expect(await listMembers(db, 'glue')).toHaveLength(1)
  })

  it('finds the member of an account', async () => {
    expect(await findMember(db, 'glue', 'user-tim')).toMatchObject({ id: 1 })
    expect(await findMember(db, 'glue', 'user-ada')).toBeUndefined()
    expect(await findMember(db, 'flexibeck', 'user-tim')).toBeUndefined()
  })

  it('sets the loop steps of a member', async () => {
    await setLoopSteps(db, 'glue', 1, ['build', 'decide'])

    expect((await listMembers(db, 'glue'))[0].loopSteps).toEqual([
      'decide',
      'build',
    ])
  })

  it('refuses a loop step that is not in the loop', async () => {
    await expect(setLoopSteps(db, 'glue', 1, ['sleep'])).rejects.toThrow()
  })
})

describe('assignments', () => {
  beforeEach(async () => {
    await joinProject(db, 'glue', ada)
  })

  it('makes a member Responsible for a Part and for a Concept', async () => {
    await assign(db, 'glue', {
      member: 'tim@example.com',
      role: 'responsible',
      part: 'D1',
    })
    await assign(db, 'glue', {
      member: 'ada@example.com',
      role: 'co-author',
      concept: 'people',
    })

    expect(await listAssignments(db, 'glue')).toEqual([
      { id: 1, memberId: 1, role: 'responsible', concept: null, part: 'D1' },
      { id: 2, memberId: 2, role: 'co-author', concept: 'people', part: null },
    ])
  })

  it('keeps one Responsible: the new one takes the place of the old one', async () => {
    await assign(db, 'glue', {
      member: 'tim@example.com',
      role: 'responsible',
      part: 'D1',
    })
    await assign(db, 'glue', {
      member: 'ada@example.com',
      role: 'responsible',
      part: 'D1',
    })

    expect(await listAssignments(db, 'glue')).toMatchObject([
      { memberId: 2, role: 'responsible', part: 'D1' },
    ])
  })

  it('changes the role of a member that has one already', async () => {
    await assign(db, 'glue', {
      member: 'tim@example.com',
      role: 'co-author',
      part: 'D1',
    })
    await assign(db, 'glue', {
      member: 'tim@example.com',
      role: 'responsible',
      part: 'D1',
    })

    expect(await listAssignments(db, 'glue')).toMatchObject([
      { memberId: 1, role: 'responsible', part: 'D1' },
    ])
  })

  it('refuses a member, a Part or a Concept that the Project does not have', async () => {
    await expect(
      assign(db, 'glue', {
        member: 'nobody@example.com',
        role: 'responsible',
        part: 'D1',
      }),
    ).rejects.toThrow('nobody@example.com is no member of glue.')
    await expect(
      assign(db, 'glue', {
        member: 'tim@example.com',
        role: 'responsible',
        part: 'D9',
      }),
    ).rejects.toThrow('D9 not found')
    await expect(
      assign(db, 'glue', {
        member: 'tim@example.com',
        role: 'responsible',
        concept: 'nothing',
      }),
    ).rejects.toThrow('nothing not found')
  })

  it('refuses an assignment with a Part and a Concept, or with none', async () => {
    await expect(
      assign(db, 'glue', { member: 'tim@example.com', role: 'responsible' }),
    ).rejects.toThrow()
    await expect(
      assign(db, 'glue', {
        member: 'tim@example.com',
        role: 'responsible',
        part: 'D1',
        concept: 'people',
      }),
    ).rejects.toThrow()
  })

  it('removes an assignment', async () => {
    await assign(db, 'glue', {
      member: 'tim@example.com',
      role: 'responsible',
      part: 'D1',
    })

    await unassign(db, 'glue', { member: 'tim@example.com', part: 'D1' })

    expect(await listAssignments(db, 'glue')).toEqual([])
  })

  it('lists for a member the Parts of the member and the Parts of nobody', async () => {
    await assign(db, 'glue', {
      member: 'tim@example.com',
      role: 'responsible',
      part: 'D1',
    })
    await assign(db, 'glue', {
      member: 'ada@example.com',
      role: 'co-author',
      part: 'D1',
    })
    await assign(db, 'glue', {
      member: 'ada@example.com',
      role: 'responsible',
      part: 'D2',
    })

    const ids = async (member?: string) =>
      (await listMine(db, 'glue', member)).map((part) => part.id).sort()

    expect(await ids('tim@example.com')).toEqual(['D1', 'I1'])
    expect(await ids('ada@example.com')).toEqual(['D1', 'D2', 'I1'])
    expect(await ids()).toEqual(['D1', 'D2', 'I1'])
  })
})
