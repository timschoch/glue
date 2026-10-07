import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import { joinProject } from './members.ts'
import { addProject } from './part-records.ts'
import * as schema from './schema.ts'
import { createSignalFilterActions } from './signal-filter-actions.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)
let session: Session | undefined

const actions = createSignalFilterActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
})

const project = 'glue'
const filter = { name: 'Slow lists', mustHold: ['slow'] }
const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }

beforeEach(async () => {
  session = undefined
  await addProject(db, project)
})

describe('the actions of the saved filters', () => {
  it('sends a person with no session to sign-in', async () => {
    const refused = await actions
      .addSignalFilter({ project, filter })
      .catch((error: unknown) => error)

    expect(isRedirect(refused)).toBe(true)
  })

  it('lets a person who is no member read only', async () => {
    session = { user: ada }

    const answers = [
      await actions.addSignalFilter({ project, filter }),
      await actions.updateSignalFilter({ project, filterId: 1, filter }),
      await actions.removeSignalFilter({ project, filterId: 1 }),
    ]

    expect(answers).toEqual(
      Array(3).fill({ message: 'Only a member of the Project can change it.' }),
    )
    expect(await actions.listSignalFilters({ project })).toEqual([])
  })

  it('saves, changes and deletes for a member, and says why a write failed', async () => {
    session = { user: ada }
    await joinProject(db, project, ada)

    const added = await actions.addSignalFilter({ project, filter })
    const again = await actions.addSignalFilter({ project, filter })
    const changed = await actions.updateSignalFilter({
      project,
      filterId: 1,
      filter: { name: 'Slow', mustHold: ['slow'] },
    })
    const listed = await actions.listSignalFilters({ project })
    const removed = await actions.removeSignalFilter({ project, filterId: 1 })

    expect(added).toEqual({ id: 1 })
    expect(again).toEqual({ message: '"Slow lists" is a filter already' })
    expect(changed).toEqual({ id: 1 })
    expect(listed).toEqual([
      { id: 1, name: 'Slow', mustHold: ['slow'], mustNotHold: [], sources: [] },
    ])
    expect(removed).toBeUndefined()
    expect(await actions.listSignalFilters({ project })).toEqual([])
  })
})
