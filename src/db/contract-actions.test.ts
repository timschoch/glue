import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import { createContractActions } from './contract-actions.ts'
import { assign, joinProject } from './members.ts'
import { addConcept, addPart, addProject, answerPart } from './part-records.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)
let session: Session | undefined

const actions = createContractActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
})

const project = 'flexibeck'
const input = { project, concept: 'cart' }

beforeEach(async () => {
  session = undefined
  await addProject(db, project)
  await joinProject(db, project, ada)
  await addConcept(db, project, { slug: 'cart', title: 'Cart' })
  await addPart(db, project, {
    type: 'goal',
    title: 'First bake feels easy',
    metric: 'ease',
    source: 'okr',
  })
  await addPart(db, project, {
    type: 'insight',
    title: 'Bakers want step videos',
    source: 'interview',
    date: '2026-10-01',
  })
  await addPart(db, project, {
    type: 'decision',
    title: 'Pay in one step',
    owner: 'Ada',
    date: '2026-10-02',
    status: 'accepted',
    needs: ['G1', 'I1'],
  })
  await addPart(db, project, {
    type: 'flow',
    concept: 'cart',
    title: 'Pay the cart',
    needs: ['D1'],
  })
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
  listContractQuestions: () => actions.listContractQuestions(input),
  listMineContractQuestions: () =>
    actions.listMineContractQuestions({ project }),
  askContractQuestion: () =>
    actions.askContractQuestion({ ...input, text: 'Is the cart saved?' }),
  answerContractQuestion: () =>
    actions.answerContractQuestion({ project, questionId: 1, text: 'Yes.' }),
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

  it('asks and answers a question with the name of the member', async () => {
    await answerPart(db, project, 'F1', { answer: 'supersede' })
    await actions.signContract(input)
    await assign(db, project, {
      member: ada.email,
      concept: 'cart',
      role: 'responsible',
    })

    expect(
      await actions.askContractQuestion({
        ...input,
        text: 'Is the cart saved?',
      }),
    ).toEqual({ id: 1 })
    expect(await actions.listMineContractQuestions({ project })).toMatchObject([
      { id: 1, version: 1, askedBy: 'Ada', answer: null },
    ])

    expect(
      await actions.answerContractQuestion({
        project,
        questionId: 1,
        text: 'Yes.',
      }),
    ).toEqual({ id: 1 })
    expect(await actions.listMineContractQuestions({ project })).toEqual([])
    expect(await actions.listContractQuestions(input)).toMatchObject([
      { id: 1, answer: { text: 'Yes.', by: 'Ada' } },
    ])
    expect(
      await actions.answerContractQuestion({
        project,
        questionId: 1,
        text: 'No.',
      }),
    ).toEqual({ message: 'Question 1 has an answer' })
  })

  it('gives a person who is no member no question in Mine, and no way to ask', async () => {
    await answerPart(db, project, 'F1', { answer: 'supersede' })
    await actions.signContract(input)
    await actions.askContractQuestion({ ...input, text: 'Is the cart saved?' })
    session = { user: { id: 'user-2', name: 'Bo', email: 'bo@example.com' } }

    expect(await actions.listMineContractQuestions({ project })).toEqual([])
    expect(
      await actions.askContractQuestion({ ...input, text: 'And the price?' }),
    ).toEqual({ message: 'Only a member of the Project can change it.' })
  })

  it('answers nothing for a Concept and a Version that do not exist', async () => {
    expect(
      await actions.findContractState({ project, concept: 'nope' }),
    ).toBeUndefined()
    expect(await actions.findContract({ ...input, version: 3 })).toBeUndefined()
  })
})
