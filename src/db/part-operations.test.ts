import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeGithub, failingGithub } from '../test/github.ts'
import { setProductRepository } from './projects.ts'
import { createPartOperations } from './part-operations.ts'
import { addPart, addProject } from './part-records.ts'
import { findPart } from './parts.ts'
import { InvalidRecordError, PartNotFoundError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { client, db } = createTestDatabase(schema)

const project = 'flexibeck'

// The one issue with the label user-feedback in the repository.
const signal = {
  url: 'https://github.com/timschoch/flexibeck-next/issues/7',
  title: 'The list is slow',
  createdAt: '2026-10-02T08:00:00Z',
}

let fake: ReturnType<typeof createFakeGithub>
let operations: ReturnType<typeof createPartOperations>

beforeEach(async () => {
  fake = createFakeGithub([signal])
  operations = createPartOperations({ db, github: fake.github })
  await addProject(db, project)
  await setProductRepository(db, project, 'timschoch/flexibeck-next')
  await addPart(db, project, {
    type: 'goal',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'okr',
  })
  await addPart(db, project, {
    type: 'insight',
    title: 'The build failed on a type error',
    source: 'verify ci',
  })
})

const decision = {
  type: 'decision' as const,
  title: 'Check the types before the push',
  owner: 'Ada',
  needs: ['G1', 'I1'],
}

const ISSUE_URL = 'https://github.com/timschoch/flexibeck-next/issues/1'

// How many statements read the table of the Parts while `run` runs.
async function countPartReads(run: () => Promise<unknown>) {
  const query = vi.spyOn(client, 'query')
  await run()
  const reads = query.mock.calls.filter(([statement]) =>
    statement.includes('from "parts"'),
  )
  query.mockRestore()
  return reads.length
}

describe('a Part that does not exist', () => {
  it('refuses the read with a not-found error', async () => {
    const refused = operations.getPart(project, 'E7')

    await expect(refused).rejects.toThrow(PartNotFoundError)
    await expect(refused).rejects.toThrow('entity "E7" not found')
  })

  it('refuses the change with a not-found error after one read of the Parts', async () => {
    let refused: unknown
    const reads = await countPartReads(() =>
      operations.updatePart(project, 'E7', { title: 'Cart' }).catch((error) => {
        refused = error
      }),
    )

    expect(refused).toBeInstanceOf(PartNotFoundError)
    expect(refused).toMatchObject({
      recordId: 'E7',
      message: 'entity "E7" not found',
    })
    expect(reads).toBe(1)
  })

  it('refuses the answer with a not-found error', async () => {
    await expect(
      operations.answerPart(project, 'I9', { answer: 'sink' }),
    ).rejects.toThrow(PartNotFoundError)
  })

  it('refuses the answer to a question with a not-found error', async () => {
    await expect(
      operations.answerQuestion(project, 'D9', { option: 1, by: 'Ada' }),
    ).rejects.toThrow(PartNotFoundError)
  })

  it('refuses a Part that needs it as a record that breaks a rule', async () => {
    const refused = await operations
      .addPart(project, { type: 'flow', title: 'Push', needs: ['E7'] })
      .catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(InvalidRecordError)
    expect(refused).not.toBeInstanceOf(PartNotFoundError)
    expect(refused).toMatchObject({ message: 'entity "E7" not found' })
  })
})

describe('a write of a Part', () => {
  it('adds a Part and gives it back as it is now', async () => {
    const added = await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
    })

    expect(added.part).toMatchObject({
      id: 'F1',
      title: 'Pay the cart',
      workState: 'draft',
    })
    expect(added.issue).toEqual({ kind: 'not-found' })
    expect(fake.issues).toEqual([])
  })

  it('changes a Part and gives it back as it is now', async () => {
    const changed = await operations.updatePart(project, 'I1', {
      title: 'The build fails on type errors',
      status: 'draft',
    })

    expect(changed.part).toMatchObject({
      id: 'I1',
      title: 'The build fails on type errors',
      status: 'draft',
    })
  })

  it('refuses a change of a Part that is not in the expected state, and keeps the Part', async () => {
    const expected = { title: 'Ship faster', metric: 'lead time' }
    await operations.updatePart(
      project,
      'G1',
      { title: 'Ship safer' },
      expected,
    )

    const refused = operations.updatePart(
      project,
      'G1',
      { title: 'Ship slower' },
      expected,
    )

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('"G1" changed since you opened it'),
    )
    expect((await findPart(db, project, 'G1'))?.title).toBe('Ship safer')
  })

  it('answers a Part and gives it back as it is now', async () => {
    const answered = await operations.answerPart(project, 'G1', {
      answer: 'supersede',
    })

    expect(answered.part).toMatchObject({
      id: 'G1',
      trust: 'solid',
      workState: 'published',
    })
  })

  it('adds the Insight that grows from a Signal and gives it back', async () => {
    const added = await operations.addSignalInsight(project, {
      signals: [signal.url],
      title: 'Long lists are slow',
    })

    expect(added.part).toMatchObject({
      id: 'I2',
      title: 'Long lists are slow',
      signals: [{ url: signal.url, title: signal.title }],
    })
    expect(added.issue).toEqual({ kind: 'not-found' })
  })
})

describe('the downstream issue of a Decision', () => {
  it('opens when a Decision is added as accepted', async () => {
    const added = await operations.addPart(project, {
      ...decision,
      status: 'accepted',
    })

    expect(added.issue).toEqual({ kind: 'created', url: ISSUE_URL })
    expect(added.part).toMatchObject({ id: 'D1', issueUrl: ISSUE_URL })
    expect(fake.issues).toHaveLength(1)
  })

  it('does not open for a Decision that is added as proposed', async () => {
    const added = await operations.addPart(project, {
      ...decision,
      status: 'proposed',
    })

    expect(added.issue).toEqual({ kind: 'not-accepted' })
    expect(fake.issues).toEqual([])
  })

  it('is missing when GitHub fails, and the Decision stays', async () => {
    operations = createPartOperations({ db, github: failingGithub })

    const added = await operations.addPart(project, {
      ...decision,
      status: 'accepted',
    })

    expect(added.issue).toEqual({
      kind: 'failed',
      message: 'GitHub answered 503',
    })
    expect(added.part).toMatchObject({
      id: 'D1',
      status: 'accepted',
      issueUrl: null,
    })
  })

  it('opens when a change accepts the Decision', async () => {
    await operations.addPart(project, { ...decision, status: 'proposed' })

    const changed = await operations.updatePart(project, 'D1', {
      status: 'accepted',
    })

    expect(changed.issue).toEqual({ kind: 'created', url: ISSUE_URL })
    expect(changed.part).toMatchObject({ status: 'accepted' })
    expect(fake.issues).toHaveLength(1)
  })

  it('opens no second time when a guarded accept finds the Decision accepted', async () => {
    await operations.addPart(project, { ...decision, status: 'accepted' })

    const refused = operations.updatePart(
      project,
      'D1',
      { status: 'accepted' },
      { status: 'proposed' },
    )

    await expect(refused).rejects.toThrow('"D1" changed since you opened it')
    expect(fake.issues).toHaveLength(1)
  })

  it('opens when the answer accepts the Decision', async () => {
    await operations.addPart(project, { ...decision, status: 'proposed' })

    const answered = await operations.answerPart(project, 'D1', {
      answer: 'supersede',
    })

    expect(answered.issue).toEqual({ kind: 'created', url: ISSUE_URL })
    expect(answered.part).toMatchObject({ status: 'accepted' })
    expect(fake.issues).toHaveLength(1)
  })

  it('opens when the answer to the question accepts the Decision', async () => {
    await operations.addPart(project, {
      ...decision,
      status: 'proposed',
      options: ['Before the push', 'In CI'],
      pick: 1,
    })

    const answered = await operations.answerQuestion(project, 'D1', {
      option: 2,
      by: 'Ada',
    })

    expect(answered.issue).toEqual({ kind: 'created', url: ISSUE_URL })
    expect(answered.part).toMatchObject({
      status: 'accepted',
      question: { answer: { option: 2, text: null, by: 'Ada' } },
    })
    expect(fake.issues).toHaveLength(1)
  })
})
