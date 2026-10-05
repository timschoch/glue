import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeGithub, failingGithub } from '../test/github.ts'
import { addProjectReference, setProductRepository } from './projects.ts'
import { createPartOperations } from './part-operations.ts'
import { addConcept, addPart, addProject, removePart } from './part-records.ts'
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

  it('refuses a new Insight with an Evidence level that is no level, and names the levels', async () => {
    const refused = operations.addPart(project, {
      type: 'insight',
      title: 'Lists load in 3 seconds',
      source: 'analytics',
      // @ts-expect-error An Insight is never observed.
      evidenceLevel: 'observed',
    })

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toThrow(/"hunch".*"pattern".*"confirmed"/)
  })

  it('refuses a new Insight with a status other than draft, names draft and adds nothing', async () => {
    const refused = operations.addPart(project, {
      type: 'insight',
      title: 'Lists load in 3 seconds',
      source: 'analytics',
      // @ts-expect-error A new Insight is a draft or has no status.
      status: 'confirmed',
    })

    await expect(refused).rejects.toThrow('"draft"')
    await expect(operations.getPart(project, 'I2')).rejects.toThrow(
      PartNotFoundError,
    )
  })

  it.each([
    ['I1', '"draft"'],
    ['G1', /"open".*"achieved"/],
  ])(
    'refuses a status that %s does not have, and names the right ones',
    async (id, statuses) => {
      const refused = operations.updatePart(
        project,
        id,
        // @ts-expect-error No Part is ever confirmed.
        { status: 'confirmed' },
      )

      await expect(refused).rejects.toThrow(statuses)
    },
  )

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

describe('a move of a Part to another Concept', () => {
  beforeEach(async () => {
    await addConcept(db, project, { slug: 'checkout', title: 'Checkout' })
    await operations.addPart(project, {
      type: 'flow',
      title: 'Pay the cart',
      needs: ['I1'],
    })
    await operations.answerPart(project, 'F1', { answer: 'supersede' })
  })

  it('gives the Part its new home, and keeps its id, its Joints, its Trust and its Work state', async () => {
    const moved = await operations.updatePart(project, 'F1', {
      concept: 'checkout',
    })

    expect(moved.part).toMatchObject({
      id: 'F1',
      title: 'Pay the cart',
      concept: 'checkout',
      conceptTitle: 'Checkout',
      trust: 'solid',
      workState: 'published',
      needs: [{ jointId: 1, link: true, part: { id: 'I1' } }],
      flags: [],
    })
    expect(await operations.getPart(project, 'I1')).toMatchObject({
      concept: 'flexibeck',
      trust: 'solid',
      workState: 'published',
      neededBy: [{ jointId: 1, link: true, part: { id: 'F1' } }],
    })
  })

  it('refuses a move to a Concept of another Project, and keeps the home', async () => {
    await addProject(db, 'glue')
    await addConcept(db, 'glue', { slug: 'billing', title: 'Billing' })

    const refused = operations.updatePart(project, 'F1', { concept: 'billing' })

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('concept "billing" not found'),
    )
    expect(await operations.getPart(project, 'F1')).toMatchObject({
      concept: 'flexibeck',
    })
  })

  it('moves many Parts in one call', async () => {
    const moved = await operations.moveParts(project, ['F1', 'I1'], 'checkout')

    expect(moved.map(({ id, concept }) => [id, concept])).toEqual([
      ['F1', 'checkout'],
      ['I1', 'checkout'],
    ])
    expect(await operations.getPart(project, 'G1')).toMatchObject({
      concept: 'flexibeck',
    })
  })

  it('moves no Part when one of them does not exist', async () => {
    const refused = operations.moveParts(project, ['F1', 'E7'], 'checkout')

    await expect(refused).rejects.toThrow(PartNotFoundError)
    expect(await operations.getPart(project, 'F1')).toMatchObject({
      concept: 'flexibeck',
    })
  })
})

describe('a move of Parts to another Project', () => {
  const target = { project: 'glue-build', concept: 'run' }

  beforeEach(async () => {
    await addProject(db, 'glue')
    await addProject(db, 'glue-build')
    await addConcept(db, 'glue-build', { slug: 'run', title: 'Build run' })
    await addProjectReference(db, 'glue-build', 'glue')
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'A red check blocks the merge',
      source: 'verify ci',
    })
    await addPart(db, 'glue', {
      type: 'flow',
      title: 'Merge gate',
      needs: ['I1'],
    })
  })

  it('gives the Parts their new Project, and keeps their ids, their Joint, their Trust and their Work state', async () => {
    const moved = await operations.movePartsToProject(
      'glue',
      ['F1', 'I1'],
      target,
    )

    expect(moved.droppedJoints).toEqual([])
    expect(moved.parts.map(({ id, concept }) => [id, concept])).toEqual([
      ['F1', 'run'],
      ['I1', 'run'],
    ])
    expect(await operations.getPart('glue-build', 'F1')).toMatchObject({
      title: 'Merge gate',
      trust: 'not-ready',
      workState: 'draft',
      needs: [{ jointId: 1, part: { id: 'I1' } }],
    })
    expect(await operations.getPart('glue-build', 'I1')).toMatchObject({
      trust: 'solid',
      workState: 'published',
      neededBy: [{ jointId: 1, part: { id: 'F1' } }],
    })
    await expect(operations.getPart('glue', 'F1')).rejects.toThrow(
      PartNotFoundError,
    )
  })

  // A read of each moved Part at the same time is more requests than Neon
  // takes: the move of 113 Parts failed on a read after its write (I99).
  it('reads the moved Parts with one statement, however many they are', async () => {
    await addPart(db, 'glue', { type: 'entity', title: 'Check' })
    await addPart(db, 'glue', { type: 'entity', title: 'Gate' })
    await addPart(db, 'glue', { type: 'entity', title: 'Override' })

    const reads = await countPartReads(() =>
      operations.movePartsToProject('glue', ['E1', 'E2', 'E3'], target),
    )

    // One read before the write, one after it.
    expect(reads).toBe(2)
  })

  it('refuses the whole move when the target Project has one of the ids, and names it', async () => {
    await addPart(db, 'glue-build', {
      type: 'insight',
      title: 'A Worker skipped the gate',
      source: 'review',
    })

    const refused = operations.movePartsToProject('glue', ['F1', 'I1'], target)

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('Project "glue-build" has "I1" already'),
    )
    expect(await operations.getPart('glue', 'F1')).toMatchObject({
      concept: 'glue',
    })
  })

  it('refuses a move that leaves a Joint in the refused direction, and names the pair', async () => {
    const refused = operations.movePartsToProject('glue', ['I1'], target)

    await expect(refused).rejects.toThrow(
      new InvalidRecordError(
        'the move leaves a Joint that no reference allows: glue/F1 needs glue-build/I1',
      ),
    )
    expect(await operations.getPart('glue', 'I1')).toMatchObject({
      concept: 'glue',
    })
  })

  it('removes the refused Joint with the flag, and gives it back', async () => {
    const moved = await operations.movePartsToProject('glue', ['I1'], {
      ...target,
      dropRefusedJoints: true,
    })

    expect(moved.droppedJoints).toEqual([
      { part: 'glue/F1', needs: 'glue-build/I1' },
    ])
    expect((await operations.getPart('glue', 'F1')).needs).toEqual([])
    expect(await operations.getPart('glue-build', 'I1')).toMatchObject({
      concept: 'run',
      neededBy: [],
    })
  })

  it('keeps a Joint in the direction of the reference, and reads it with the Project of the needed Part', async () => {
    const moved = await operations.movePartsToProject('glue', ['F1'], target)

    expect(moved.droppedJoints).toEqual([])
    expect((await operations.getPart('glue-build', 'F1')).needs).toEqual([
      {
        jointId: 1,
        twoWay: false,
        link: true,
        contractVersion: null,
        project: { slug: 'glue', name: 'glue' },
        part: {
          id: 'I1',
          type: 'insight',
          title: 'A red check blocks the merge',
          status: null,
          trust: 'solid',
          workState: 'published',
          concept: 'glue',
          conceptTitle: 'glue',
        },
      },
    ])
    expect((await operations.getPart('glue', 'I1')).neededBy).toEqual([])
  })

  it('gives the next Part of the target Project a number after the ones that came in', async () => {
    await addPart(db, 'glue', {
      type: 'flow',
      title: 'Release',
    })
    await operations.movePartsToProject('glue', ['F2'], target)
    await removePart(db, 'glue-build', 'F2')

    const added = await operations.addPart('glue-build', {
      type: 'flow',
      title: 'Circle report',
    })

    expect(added.part.id).toBe('F3')
  })
})

describe('the status of a Decision that exists', () => {
  beforeEach(async () => {
    await operations.addPart(project, { ...decision, status: 'proposed' })
    await operations.addPart(project, { ...decision, status: 'accepted' })
  })

  it('accepts the Decision and opens its issue', async () => {
    const changed = await operations.setDecisionStatus(project, 'D1', {
      status: 'accepted',
    })

    expect(changed.part).toMatchObject({ id: 'D1', status: 'accepted' })
    expect(changed.issue).toEqual({
      kind: 'created',
      url: 'https://github.com/timschoch/flexibeck-next/issues/2',
    })
  })

  it('supersedes the Decision with its accepted successor', async () => {
    const changed = await operations.setDecisionStatus(project, 'D1', {
      status: 'superseded',
      supersededBy: 'D2',
    })

    expect(changed.part).toMatchObject({
      id: 'D1',
      status: 'superseded',
      supersededBy: { id: 'D2' },
      trust: 'wrong',
      workState: 'sunk',
    })
    expect(changed.issue).toEqual({ kind: 'not-accepted' })
  })

  it('refuses the status superseded without a successor, and keeps the Decision', async () => {
    const refused = operations.setDecisionStatus(
      project,
      'D1',
      // @ts-expect-error A superseded Decision names its successor.
      { status: 'superseded' },
    )

    await expect(refused).rejects.toThrow(
      new InvalidRecordError(
        'the status "superseded" and "supersededBy" go together',
      ),
    )
    expect(await operations.getPart(project, 'D1')).toMatchObject({
      status: 'proposed',
      supersededBy: null,
    })
  })

  it('refuses a successor for another status, and keeps the Decision', async () => {
    const refused = operations.setDecisionStatus(
      project,
      'D1',
      // @ts-expect-error Only a superseded Decision has a successor.
      { status: 'accepted', supersededBy: 'D2' },
    )

    await expect(refused).rejects.toThrow(
      new InvalidRecordError(
        'the status "superseded" and "supersededBy" go together',
      ),
    )
    expect(await operations.getPart(project, 'D1')).toMatchObject({
      status: 'proposed',
      supersededBy: null,
    })
  })

  it('refuses a status that a Decision does not have, and names the ones that it has', async () => {
    const refused = operations.setDecisionStatus(project, 'D1', {
      // @ts-expect-error A Decision is never confirmed.
      status: 'confirmed',
    })

    await expect(refused).rejects.toThrow(InvalidRecordError)
    await expect(refused).rejects.toThrow(/"proposed"\|"accepted"/)
  })

  it('refuses a successor that is not a Decision', async () => {
    await expect(
      operations.setDecisionStatus(project, 'D1', {
        status: 'superseded',
        supersededBy: 'G1',
      }),
    ).rejects.toThrow(new InvalidRecordError('"G1" is not a Decision'))
  })

  it('refuses a Decision that does not exist with a not-found error', async () => {
    await expect(
      operations.setDecisionStatus(project, 'D9', {
        status: 'superseded',
        supersededBy: 'D2',
      }),
    ).rejects.toThrow(PartNotFoundError)
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

// The record ids of the Goals that the Part needs.
function listGoals(part: { needs: { part: { id: string; type: string } }[] }) {
  return part.needs
    .filter((end) => end.part.type === 'goal')
    .map((end) => end.part.id)
}

describe('another Goal for a Decision', () => {
  beforeEach(async () => {
    await addPart(db, project, {
      type: 'goal',
      title: 'Break less',
      metric: 'failed releases',
      source: 'okr',
    })
    await operations.addPart(project, { ...decision, status: 'accepted' })
  })

  it('gives the Decision the new Goal in the place of the old one', async () => {
    const changed = await operations.updatePart(project, 'D1', { goal: 'G2' })

    expect(listGoals(changed.part)).toEqual(['G2'])
    expect(changed.part.needs.map((end) => end.part.id)).toEqual(['I1', 'G2'])
  })

  it('writes one line in the activity of the Decision', async () => {
    const changed = await operations.updatePart(project, 'D1', { goal: 'G2' })

    expect(changed.part.activity.map(({ kind }) => kind)).toEqual([
      'changed',
      'published',
    ])
  })

  it('writes nothing for the Goal that the Decision has already', async () => {
    const changed = await operations.updatePart(project, 'D1', { goal: 'G1' })

    expect(listGoals(changed.part)).toEqual(['G1'])
    expect(changed.part.activity.map(({ kind }) => kind)).toEqual(['published'])
  })

  it('refuses a Part that is not a Goal, and keeps the Goal', async () => {
    const refused = operations.updatePart(project, 'D1', { goal: 'I1' })

    await expect(refused).rejects.toThrow(
      new InvalidRecordError('"I1" is not a Goal'),
    )
    expect(listGoals(await operations.getPart(project, 'D1'))).toEqual(['G1'])
  })

  it('refuses a Goal on each other Part type', async () => {
    const refused = operations.updatePart(project, 'I1', { goal: 'G2' })

    await expect(refused).rejects.toThrow('Unrecognized key: "goal"')
  })

  describe('of another Project', () => {
    beforeEach(async () => {
      await addProject(db, 'glue')
      await addPart(db, 'glue', {
        type: 'goal',
        title: 'Glue builds Glue',
        metric: 'circles',
        source: 'run goal',
      })
      await operations.answerPart('glue', 'G1', { answer: 'supersede' })
    })

    it('refuses the Goal of a Project that is not referenced, and keeps the Goal', async () => {
      const refused = operations.updatePart(project, 'D1', { goal: 'glue/G1' })

      await expect(refused).rejects.toThrow(
        new InvalidRecordError(
          'a Part of Project "flexibeck" cannot need a Part of Project "glue"',
        ),
      )
      expect(
        (await operations.getPart(project, 'D1')).needs.map((end) => [
          end.project?.slug,
          end.part.id,
        ]),
      ).toEqual([
        [undefined, 'G1'],
        [undefined, 'I1'],
      ])
    })

    it('takes the Goal of a Project that is referenced', async () => {
      await addProjectReference(db, project, 'glue')

      const changed = await operations.updatePart(project, 'D1', {
        goal: 'glue/G1',
      })

      expect(
        changed.part.needs.map((end) => [end.project?.slug, end.part.id]),
      ).toEqual([
        [undefined, 'I1'],
        ['glue', 'G1'],
      ])
    })
  })
})

describe('another body for a Part', () => {
  beforeEach(async () => {
    await operations.addPart(project, { ...decision, status: 'accepted' })
    await operations.addPart(project, { type: 'flow', title: 'Push' })
    await operations.addPart(project, {
      type: 'guardrail',
      title: 'CI takes ten minutes at most',
      enforcedBy: 'verify ci',
    })
    await operations.addPart(project, { type: 'entity', title: 'Check' })
    await operations.addPart(project, { type: 'metric', title: 'Lead time' })
  })

  it.each(['G1', 'I1', 'D1', 'F1', 'R1', 'E1', 'M1'])(
    'changes the body of %s',
    async (id) => {
      const changed = await operations.updatePart(project, id, {
        body: 'The push waits for the types.',
      })

      expect(changed.part.body).toBe('The push waits for the types.')
    },
  )

  it('changes the title of a Decision, and its issue keeps the old title', async () => {
    const changed = await operations.updatePart(project, 'D1', {
      title: 'Check the types in CI',
    })

    expect(changed.part.title).toBe('Check the types in CI')
    expect(changed.issue).toEqual({ kind: 'existing', url: ISSUE_URL })
    expect(fake.issues.map(({ issue }) => issue.title)).toEqual([
      'D1: Check the types before the push',
    ])
  })

  it('glues the Decision to a Part that the new body names', async () => {
    const changed = await operations.updatePart(project, 'D1', {
      body: 'The push follows #F1.',
    })

    expect(changed.part.needs.map((end) => end.part.id)).toEqual([
      'G1',
      'I1',
      'F1',
    ])
  })

  it('writes one line in the activity of the Decision', async () => {
    const changed = await operations.updatePart(project, 'D1', {
      body: 'The push waits for the types.',
    })

    expect(changed.part.activity.map(({ kind }) => kind)).toEqual([
      'changed',
      'published',
    ])
  })
})
