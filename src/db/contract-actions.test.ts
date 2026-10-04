import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import { createContractActions } from './contract-actions.ts'
import { joinProject } from './members.ts'
import { addPart, addProject, answerPart } from './part-records.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)
let session: Session | undefined

const actions = createContractActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
})

const project = 'flexibeck'
const input = { project, concept: project }

beforeEach(async () => {
  session = undefined
  await addProject(db, project)
  await addPart(db, project, { type: 'flow', title: 'Pay the cart' })
})

const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }

// Ada signs in. She is a member of the Project.
async function signIn() {
  session = { user: ada }
  await joinProject(db, project, ada)
}

const requests = {
  findContractState: () => actions.findContractState(input),
  findContract: () => actions.findContract(input),
  signContract: () => actions.signContract(input),
} satisfies Record<keyof typeof actions, () => Promise<unknown>>

describe('a server function of the Contract without a session', () => {
  it.each(Object.keys(actions) as (keyof typeof actions)[])(
    '%s sends the person to sign-in and signs nothing',
    async (name) => {
      await answerPart(db, project, 'F1', { answer: 'supersede' })

      const refused = await requests[name]().then(
        () => undefined,
        (error: unknown) => error,
      )

      expect(isRedirect(refused) && refused.options.to).toBe('/sign-in')
      expect(await db.select().from(schema.contractVersions)).toEqual([])
    },
  )
})

describe('a server function of the Contract with a session', () => {
  beforeEach(signIn)

  it('names the Parts that block the sign-off', async () => {
    const state = await actions.findContractState(input)

    expect(state).toMatchObject({
      versions: [],
      ahead: false,
      blocking: [{ id: 'F1', trust: 'not-ready' }],
    })
    expect(await actions.signContract(input)).toEqual({
      message: 'sign-off needs Trust solid: F1',
    })
  })

  it('lets only a member sign off', async () => {
    await answerPart(db, project, 'F1', { answer: 'supersede' })
    session = { user: { id: 'user-2', name: 'Bo', email: 'bo@example.com' } }

    expect(await actions.signContract(input)).toEqual({
      message: 'Only a member of the Project can change it.',
    })
    expect(await db.select().from(schema.contractVersions)).toEqual([])
  })

  it('signs off with the name of the member, then reads the Version', async () => {
    await answerPart(db, project, 'F1', { answer: 'supersede' })

    expect(await actions.signContract(input)).toEqual({ version: 1 })

    const state = await actions.findContractState(input)
    const contract = await actions.findContract({ ...input, version: 1 })
    expect(state).toMatchObject({
      versions: [{ version: 1, signedBy: 'Ada' }],
      ahead: false,
      blocking: [],
    })
    expect(contract).toMatchObject({
      version: 1,
      newestVersion: 1,
      tier1: [{ id: 'F1', title: 'Pay the cart' }],
    })
  })

  it('answers nothing for a Concept and a Version that do not exist', async () => {
    expect(
      await actions.findContractState({ project, concept: 'nope' }),
    ).toBeUndefined()
    expect(await actions.findContract({ ...input, version: 3 })).toBeUndefined()
  })
})
