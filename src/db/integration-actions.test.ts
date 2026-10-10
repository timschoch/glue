import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import { TEAM_KEY, createFakeIntegrations } from '../test/integrations.ts'
import { createIntegrationActions } from './integration-actions.ts'
import { joinProject } from './members.ts'
import { addProject } from './part-records.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)
let session: Session | undefined

const actions = createIntegrationActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
  getIntegrations: createFakeIntegrations,
})

const project = 'glue'
const integration = { tool: 'github', address: 'acme/shop', key: TEAM_KEY }
const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }

beforeEach(async () => {
  session = undefined
  await addProject(db, project)
})

describe('the actions of the Integrations', () => {
  it('sends a person with no session to sign-in', async () => {
    const refused = await actions
      .addIntegration({ project, integration })
      .catch((error: unknown) => error)

    expect(isRedirect(refused)).toBe(true)
  })

  it('lets a person who is no member read only', async () => {
    session = { user: ada }

    const answers = [
      await actions.addIntegration({ project, integration }),
      await actions.pauseIntegration({ project, integrationId: 1 }),
      await actions.startIntegration({ project, integrationId: 1 }),
      await actions.removeIntegration({ project, integrationId: 1 }),
    ]

    expect(answers).toEqual(
      Array(4).fill({ message: 'Only a member of the Project can change it.' }),
    )
    expect(await actions.listIntegrations({ project })).toEqual([])
  })

  it('adds, pauses, starts and removes for a member, and says where a write failed', async () => {
    session = { user: ada }
    await joinProject(db, project, ada)

    const refused = await actions.addIntegration({
      project,
      integration: { ...integration, key: 'another-key' },
    })
    const added = await actions.addIntegration({ project, integration })
    const paused = await actions.pauseIntegration({ project, integrationId: 1 })
    const started = await actions.startIntegration({
      project,
      integrationId: 1,
    })
    const removed = await actions.removeIntegration({
      project,
      integrationId: 1,
    })

    expect(refused).toEqual({
      message: 'GitHub refused the key',
      place: { field: 'key' },
    })
    expect(added).toEqual({ id: 1 })
    expect(paused).toEqual({ id: 1 })
    expect(started).toEqual({ id: 1 })
    expect(removed).toBeUndefined()
    expect(await actions.listIntegrations({ project })).toEqual([])
  })

  it('gives no key back, open or encrypted', async () => {
    session = { user: ada }
    await joinProject(db, project, ada)

    const answers = JSON.stringify([
      await actions.addIntegration({ project, integration }),
      await actions.pauseIntegration({ project, integrationId: 1 }),
      await actions.startIntegration({ project, integrationId: 1 }),
      await actions.listIntegrations({ project }),
    ])
    const [{ encryptedKey }] = await db.select().from(schema.integrations)

    expect(answers).toContain('"keyLastFour":"1234"')
    expect(answers).not.toContain(TEAM_KEY)
    expect(answers).not.toContain(encryptedKey)
  })
})
