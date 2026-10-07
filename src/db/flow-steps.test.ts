import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeGithub } from '../test/github.ts'
import { findContract, findContractState, signContract } from './contracts.ts'
import { joinProject } from './members.ts'
import { createPartOperations } from './part-operations.ts'
import { addProject } from './part-records.ts'
import { findPart } from './parts.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const project = 'flexibeck'

let operations: ReturnType<typeof createPartOperations>

beforeEach(async () => {
  operations = createPartOperations({ db, github: createFakeGithub().github })
  await addProject(db, project)
  await joinProject(db, project, {
    id: 'user-tim',
    name: 'Tim',
    email: 'tim@example.com',
  })
})

describe('the steps of a Flow', () => {
  it('keeps the steps in their order', async () => {
    const { part } = await operations.addPart(project, {
      type: 'flow',
      title: 'Watch a technique while baking',
      steps: [
        { text: 'Open the recipe', entity: null },
        { text: 'Start the video', entity: null },
      ],
    })

    expect(part.steps).toEqual([
      { text: 'Open the recipe', entity: null },
      { text: 'Start the video', entity: null },
    ])
  })

  it('takes a new list in the place of the old one', async () => {
    await operations.addPart(project, {
      type: 'flow',
      title: 'Watch a technique while baking',
      steps: [
        { text: 'Open the recipe', entity: null },
        { text: 'Start the video', entity: null },
      ],
    })

    const { part } = await operations.updatePart(project, 'F1', {
      steps: [
        { text: 'Start the video', entity: null },
        { text: 'Open the recipe', entity: null },
      ],
    })

    expect(part.steps).toEqual([
      { text: 'Start the video', entity: null },
      { text: 'Open the recipe', entity: null },
    ])
  })

  it('has no steps when the Flow names none', async () => {
    const { part } = await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
      body: 'The baker pays.',
    })

    expect(part.steps).toEqual([])
    expect(part.body).toBe('The baker pays.')
  })
})

describe('the fields of an Entity', () => {
  it('keeps each field with its name and its meaning', async () => {
    const { part } = await operations.addPart(project, {
      type: 'entity',
      title: 'Technique',
      fields: [
        { name: 'name', meaning: 'What bakers call it' },
        { name: 'video', meaning: 'The clip of the creator' },
      ],
    })

    expect(part.fields).toEqual([
      { name: 'name', meaning: 'What bakers call it' },
      { name: 'video', meaning: 'The clip of the creator' },
    ])
  })

  it('takes a new list in the place of the old one', async () => {
    await operations.addPart(project, {
      type: 'entity',
      title: 'Technique',
      fields: [{ name: 'name', meaning: 'What bakers call it' }],
    })

    const { part } = await operations.updatePart(project, 'E1', {
      fields: [{ name: 'title', meaning: 'What the creator calls it' }],
    })

    expect(part.fields).toEqual([
      { name: 'title', meaning: 'What the creator calls it' },
    ])
  })

  it('refuses steps: only a Flow has them', async () => {
    await expect(
      operations.addPart(project, {
        type: 'entity',
        title: 'Technique',
        // @ts-expect-error an Entity has no steps
        steps: [{ text: 'Open the recipe', entity: null }],
      }),
    ).rejects.toThrow('Unrecognized key: "steps"')
  })

  it('refuses two fields with the same name, also in a change', async () => {
    const fields = [
      { name: 'video', meaning: 'The clip of the creator' },
      { name: 'video', meaning: 'The file of the clip' },
    ]

    await expect(
      operations.addPart(project, {
        type: 'entity',
        title: 'Technique',
        fields,
      }),
    ).rejects.toThrow('field "video" is there twice')

    await operations.addPart(project, { type: 'entity', title: 'Technique' })

    await expect(
      operations.updatePart(project, 'E1', { fields }),
    ).rejects.toThrow('field "video" is there twice')
  })
})

describe('a change of the lists that a second person changed', () => {
  it('keeps the steps of the second person', async () => {
    const seen = [{ text: 'Open the recipe', entity: null }]
    await operations.addPart(project, {
      type: 'flow',
      title: 'Watch a technique while baking',
      steps: seen,
    })
    await operations.updatePart(
      project,
      'F1',
      { steps: [{ text: 'Start the video', entity: null }] },
      { steps: seen },
    )

    const refused = operations.updatePart(
      project,
      'F1',
      { steps: [{ text: 'Close the recipe', entity: null }] },
      { steps: seen },
    )

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('"F1" changed since you opened it'),
    )
    expect((await findPart(db, project, 'F1'))?.steps).toEqual([
      { text: 'Start the video', entity: null },
    ])
  })

  it('keeps the fields of the second person', async () => {
    const seen = [{ name: 'name', meaning: 'What bakers call it' }]
    await operations.addPart(project, {
      type: 'entity',
      title: 'Technique',
      fields: seen,
    })
    await operations.updatePart(
      project,
      'E1',
      { fields: [{ name: 'title', meaning: 'What the creator calls it' }] },
      { fields: seen },
    )

    const refused = operations.updatePart(
      project,
      'E1',
      { fields: [{ name: 'video', meaning: 'The clip' }] },
      { fields: seen },
    )

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('"E1" changed since you opened it'),
    )
    expect((await findPart(db, project, 'E1'))?.fields).toEqual([
      { name: 'title', meaning: 'What the creator calls it' },
    ])
  })
})

describe('a step that names an Entity', () => {
  beforeEach(async () => {
    await operations.addPart(project, { type: 'entity', title: 'Technique' })
  })

  const flow = {
    type: 'flow' as const,
    title: 'Watch a technique while baking',
    steps: [
      { text: 'Open the recipe', entity: null },
      { text: 'Pick it', entity: 'E1' },
    ],
  }

  it('keeps the record id of the Entity on the step', async () => {
    const { part } = await operations.addPart(project, flow)

    expect(part.steps).toEqual([
      { text: 'Open the recipe', entity: null },
      { text: 'Pick it', entity: 'E1' },
    ])
  })

  it('refuses an Entity that the Project does not have', async () => {
    const refused = operations.addPart(project, {
      ...flow,
      steps: [{ text: 'Pick it', entity: 'E7' }],
    })

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toThrow('entity "E7" not found')
  })

  it('names the step of the Entity that it refuses', async () => {
    const missing = operations.addPart(project, {
      ...flow,
      steps: [
        { text: 'Open the recipe', entity: null },
        { text: 'Pick it', entity: 'E7' },
      ],
    })
    await expect(missing).rejects.toMatchObject({
      place: { field: 'steps', row: 1 },
    })

    await operations.addPart(project, flow)
    const wrong = operations.updatePart(project, 'F1', {
      steps: [{ text: 'Pick it', entity: 'F1' }],
    })
    await expect(wrong).rejects.toMatchObject({
      place: { field: 'steps', row: 0 },
    })
  })

  it('refuses a Part that is no Entity, also in a change', async () => {
    await operations.addPart(project, flow)

    const refused = operations.updatePart(project, 'F1', {
      steps: [{ text: 'Pick it', entity: 'F1' }],
    })

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toThrow('"F1" is not an Entity')
  })

  it('shows the Flow on the Entity', async () => {
    await operations.addPart(project, flow)

    const entity = await operations.getPart(project, 'E1')

    expect(entity.neededBy.map(({ part }) => part.id)).toEqual(['F1'])
  })

  it('shows the Flow no more when the step names the Entity no more', async () => {
    await operations.addPart(project, flow)

    await operations.updatePart(project, 'F1', {
      steps: [
        { text: 'Open the recipe', entity: null },
        { text: 'Pick it', entity: null },
      ],
    })

    const entity = await operations.getPart(project, 'E1')
    expect(entity.neededBy).toEqual([])
  })

  it('shows the Flow from the first change that names the Entity', async () => {
    await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
      body: 'The baker pays.',
    })

    await operations.updatePart(project, 'F1', {
      steps: [{ text: 'Pick it', entity: 'E1' }],
    })

    const entity = await operations.getPart(project, 'E1')
    expect(entity.neededBy.map(({ part }) => part.id)).toEqual(['F1'])
  })

  it('flags the Part that needs a published Flow when its steps change', async () => {
    await operations.addPart(project, flow)
    await operations.answerPart(project, 'F1', { answer: 'supersede' })
    await operations.addPart(project, {
      type: 'guardrail',
      title: 'The video never blocks the recipe',
      enforcedBy: 'review',
      needs: ['F1'],
    })
    await operations.answerPart(project, 'R1', { answer: 'supersede' })

    await operations.updatePart(project, 'F1', {
      steps: [{ text: 'Pick it', entity: 'E1' }],
    })

    const guardrail = await operations.getPart(project, 'R1')
    expect(guardrail.trust).toBe('flagged')
  })
})

describe('the Version of a Part', () => {
  it('keeps the steps of a Flow as they were at the sign-off', async () => {
    await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
      steps: [{ text: 'Open the cart', entity: null }],
    })
    await operations.answerPart(project, 'F1', { answer: 'supersede' })

    const { part } = await operations.updatePart(project, 'F1', {
      steps: [
        { text: 'Open the cart', entity: null },
        { text: 'Pay', entity: null },
      ],
    })

    expect(part.versions).toMatchObject([
      { version: 1, steps: [{ text: 'Open the cart', entity: null }] },
    ])
  })

  it('keeps the fields of an Entity as they were at the sign-off', async () => {
    await operations.addPart(project, {
      type: 'entity',
      title: 'Cart',
      fields: [{ name: 'total', meaning: 'The sum to pay' }],
    })
    await operations.answerPart(project, 'E1', { answer: 'supersede' })

    const { part } = await operations.updatePart(project, 'E1', { fields: [] })

    expect(part.versions).toMatchObject([
      { version: 1, fields: [{ name: 'total', meaning: 'The sum to pay' }] },
    ])
  })
})

// A Flow and an Entity are solid only with a Decision: D1.
async function addDecision() {
  await operations.addPart(project, {
    type: 'goal',
    title: 'Paying feels easy',
    metric: 'ease',
    source: 'okr',
  })
  await operations.answerPart(project, 'G1', { answer: 'supersede' })
  await operations.addPart(project, {
    type: 'insight',
    title: 'Bakers leave at the cart',
    source: 'interview',
  })
  await operations.addPart(project, {
    type: 'decision',
    title: 'Pay on one screen',
    owner: 'Tim',
    status: 'accepted',
    needs: ['G1', 'I1'],
  })
}

describe('the Contract of a Concept with a Flow and an Entity', () => {
  beforeEach(async () => {
    await addDecision()
    await operations.addPart(project, {
      type: 'entity',
      title: 'Cart',
      fields: [{ name: 'total', meaning: 'The sum to pay' }],
      needs: ['D1'],
    })
    await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
      steps: [
        { text: 'Open the cart', entity: 'E1' },
        { text: 'Pay', entity: null },
      ],
      needs: ['D1'],
    })
    await operations.answerPart(project, 'E1', { answer: 'supersede' })
    await operations.answerPart(project, 'F1', { answer: 'supersede' })
    await signContract(db, project, project, 'Tim')
  })

  it('gives the steps and the fields to a builder as data', async () => {
    const contract = await findContract(db, project, project)

    expect(contract?.tier1).toMatchObject([
      {
        id: 'F1',
        steps: [
          { text: 'Open the cart', entity: 'E1' },
          { text: 'Pay', entity: null },
        ],
        fields: [],
      },
      {
        id: 'E1',
        steps: [],
        fields: [{ name: 'total', meaning: 'The sum to pay' }],
      },
    ])
  })

  it('is behind the Concept after a step changes', async () => {
    await operations.updatePart(project, 'F1', {
      steps: [
        { text: 'Open the cart', entity: 'E1' },
        { text: 'Pay now', entity: null },
      ],
      sameMeaning: true,
    })

    const state = await findContractState(db, project, project)
    expect(state?.ahead).toBe(true)
  })

  it('is behind the Concept after a field changes', async () => {
    await operations.updatePart(project, 'E1', {
      fields: [{ name: 'total', meaning: 'The sum to pay, with tax' }],
      sameMeaning: true,
    })

    const state = await findContractState(db, project, project)
    expect(state?.ahead).toBe(true)
  })

  it('is level with a Concept that did not change', async () => {
    const state = await findContractState(db, project, project)

    expect(state?.ahead).toBe(false)
  })
})

describe('the Contract of a Concept without steps and fields', () => {
  it('freezes a Flow and an Entity as before the lists', async () => {
    await addDecision()
    await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
      needs: ['D1'],
    })
    await operations.answerPart(project, 'F1', { answer: 'supersede' })
    await signContract(db, project, project, 'Tim')

    const stored = await db.select().from(schema.contractVersions)

    expect(stored[0].parts.filter(({ type }) => type === 'flow')).toEqual([
      {
        id: 'F1',
        type: 'flow',
        title: 'Pay the cart',
        body: '',
        concept: 'flexibeck',
        status: null,
        owner: null,
        date: null,
        source: null,
        metric: null,
        enforcedBy: null,
        evidenceLevel: null,
        needs: ['D1'],
      },
    ])
  })
})
