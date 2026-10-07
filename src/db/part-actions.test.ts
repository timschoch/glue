import { isRedirect } from '@tanstack/react-router'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import type { GithubClient } from '../github/client.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import { addAsk, pickAsk } from './asks.ts'
import { addProjectReference, setProductRepository } from './projects.ts'
import {
  answerInputSchema,
  createPartActions,
  jointRemoveInputSchema,
  partAddInputSchema,
  partListInputSchema,
  partUpdateInputSchema,
} from './part-actions.ts'
import { joinProject, listAssignments, listMembers } from './members.ts'
import { addJoint, addPart, addProject, updatePart } from './part-records.ts'
import { findPart, findProject, listParts } from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { client, db } = createTestDatabase(schema)

// The session and the GitHub of the request in the test.
let session: Session | undefined
let fake: ReturnType<typeof createFakeGithub>
let github: GithubClient

const actions = createPartActions({
  findSession: () => Promise.resolve(session),
  getDb: () => db,
  getGithub: () => github,
})

const project = 'flexibeck'

// The one issue with the label user-feedback in the repository.
const signal = {
  url: 'https://github.com/timschoch/flexibeck-next/issues/7',
  title: 'The list is slow',
  body: 'It takes five seconds to open.',
  createdAt: '2026-10-02T08:00:00Z',
}

beforeEach(async () => {
  session = undefined
  fake = createFakeGithub([signal])
  github = fake.github
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

const ada = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }

// Ada is a member of the Project.
async function signIn() {
  session = { user: ada }
  await joinProject(db, project, ada)
}

// Bo has an account and is no member of the Project.
function signInBo() {
  session = { user: { id: 'user-2', name: 'Bo', email: 'bo@example.com' } }
}

const decision = {
  type: 'decision' as const,
  title: 'Check the types before the push',
  owner: 'Ada',
  needs: ['G1', 'I1'],
}

const requests = {
  listProjects: () => actions.listProjects(),
  findProject: () => actions.findProject({ project }),
  findConcept: () => actions.findConcept({ project, concept: project }),
  listParts: () => actions.listParts({ project }),
  findPart: () => actions.findPart({ project, recordId: 'G1' }),
  addConcept: () =>
    actions.addConcept({
      project,
      concept: { slug: 'checkout', title: 'Checkout' },
    }),
  updateConcept: () =>
    actions.updateConcept({
      project,
      concept: 'checkout',
      change: { title: 'Pay' },
    }),
  removeConcept: () => actions.removeConcept({ project, concept: 'checkout' }),
  addKind: () =>
    actions.addKind({
      project,
      kind: { slug: 'prd', name: 'PRD', slots: [] },
    }),
  updateKind: () =>
    actions.updateKind({ project, kind: 'brief', change: { name: 'Note' } }),
  addPart: () =>
    actions.addPart({ project, part: { type: 'flow', title: 'Push' } }),
  updatePart: () =>
    actions.updatePart({
      project,
      recordId: 'G1',
      change: { title: 'Ship slower' },
    }),
  answerPart: () =>
    actions.answerPart({
      project,
      recordId: 'G1',
      answer: { answer: 'sink' },
    }),
  answerQuestion: () =>
    actions.answerQuestion({
      project,
      recordId: 'G1',
      answer: { option: 1 },
    }),
  listMine: () => actions.listMine({ project }),
  getNewFlagCount: () => actions.getNewFlagCount({ project }),
  setFlagsSeen: () => actions.setFlagsSeen({ project }),
  listMeasured: () => actions.listMeasured({ project }),
  listMapJoints: () => actions.listMapJoints({ project }),
  listSignals: () => actions.listSignals({ project }),
  listBuilds: () => actions.listBuilds({ project }),
  addSignalInsight: () =>
    actions.addSignalInsight({
      project,
      insight: { signals: [signal.url], title: 'Long lists are slow' },
    }),
  addJoint: () =>
    actions.addJoint({ project, joint: { part: 'I1', needs: 'G1' } }),
  removeJoint: () => actions.removeJoint({ project, jointId: 1 }),
  addProject: () => actions.addProject({ slug: 'bakeday', name: 'Bake day' }),
  findPeople: () => actions.findPeople({ project }),
  addMember: () => actions.addMember({ project, email: 'bo@example.com' }),
  setLoopSteps: () => actions.setLoopSteps({ project, loopSteps: ['build'] }),
  assign: () =>
    actions.assign({
      project,
      assignment: { member: ada.email, role: 'responsible', part: 'G1' },
    }),
  unassign: () =>
    actions.unassign({
      project,
      assignment: { member: ada.email, part: 'G1' },
    }),
  watch: () => actions.watch({ project, recordId: 'G1' }),
  unwatch: () => actions.unwatch({ project, recordId: 'G1' }),
  listWatched: () => actions.listWatched({ project }),
  listMineAsks: () => actions.listMineAsks({ project }),
  findAskState: () => actions.findAskState({ project, recordId: 'I1' }),
  addAsk: () =>
    actions.addAsk({
      project,
      ask: { kind: 'insight', part: 'I1', toProject: 'ux' },
    }),
  pickAsk: () => actions.pickAsk({ project, askId: 1 }),
  startStudy: () => actions.startStudy({ project, askId: 1 }),
  handBackAsk: () => actions.handBackAsk({ project, askId: 1, part: 'I1' }),
  takeBackAsk: () => actions.takeBackAsk({ project, askId: 1 }),
} satisfies Record<keyof typeof actions, () => Promise<unknown>>

async function readProject() {
  const found = await findProject(db, project)
  const goal = await findPart(db, project, 'G1')
  return {
    concepts: found?.concept.concepts.map(({ slug }) => slug),
    parts: (await listParts(db, project)).map(({ id }) => id),
    goal: [goal?.title, goal?.neededBy.length, goal?.workState],
  }
}

describe('a server function of the Part model without a session', () => {
  it.each(Object.keys(actions) as (keyof typeof actions)[])(
    '%s sends the person to sign-in and writes nothing',
    async (name) => {
      const refused = await requests[name]().then(
        () => undefined,
        (error: unknown) => error,
      )

      expect(isRedirect(refused) && refused.options.to).toBe('/sign-in')
      expect(await readProject()).toEqual({
        concepts: [],
        parts: ['I1', 'G1'],
        goal: ['Ship faster', 0, 'draft'],
      })
    },
  )
})

describe('a server function of the Part model with a session', () => {
  beforeEach(signIn)

  it('lists the Projects', async () => {
    await addProject(db, 'glue')

    expect(await actions.listProjects()).toEqual([
      { slug: 'flexibeck', name: 'flexibeck' },
      { slug: 'glue', name: 'glue' },
    ])
  })

  it('reads the Project with the tree of its Concepts', async () => {
    await requests.addConcept()

    const found = await actions.findProject({ project })

    expect(found?.concept).toMatchObject({
      slug: 'flexibeck',
      partCount: 2,
      concepts: [{ slug: 'checkout', title: 'Checkout', partCount: 0 }],
    })
  })

  it('answers nothing for a Project, a Concept and a Part that do not exist', async () => {
    expect(await actions.findProject({ project: 'nope' })).toBeUndefined()
    expect(
      await actions.findConcept({ project, concept: 'nope' }),
    ).toBeUndefined()
    expect(await actions.findPart({ project, recordId: 'G9' })).toBeUndefined()
  })

  it('reads a Concept with its Parts', async () => {
    const concept = await actions.findConcept({ project, concept: project })

    expect(concept?.parts.map(({ id }) => id)).toEqual(['I1', 'G1'])
  })

  it('lists the Parts of the Project, and the Parts of the types', async () => {
    const all = await actions.listParts({ project })
    const goals = await actions.listParts({ project, types: ['goal'] })

    expect(all.map(({ id }) => id)).toEqual(['I1', 'G1'])
    expect(goals.map(({ id }) => id)).toEqual(['G1'])
  })

  it('lists each Part with its flight level for the person of the session', async () => {
    await signIn()
    await actions.setLoopSteps({ project, loopSteps: ['decide'] })

    const all = await actions.listParts({ project })

    expect(all.map(({ id, flightLevel }) => [id, flightLevel])).toEqual([
      ['I1', 'strategic'],
      ['G1', 'operational'],
    ])
  })

  it('reads a Part with its Joints', async () => {
    await addJoint(db, project, { part: 'I1', needs: 'G1' })

    const part = await actions.findPart({ project, recordId: 'I1' })

    expect(part).toMatchObject({
      id: 'I1',
      type: 'insight',
      source: 'verify ci',
    })
    expect(part?.needs.map((end) => end.part.id)).toEqual(['G1'])
  })

  it('lists the Signals, and adds the Insight that grows from them', async () => {
    expect(await requests.addSignalInsight()).toEqual({
      id: 'I2',
      issueMissing: false,
    })
    expect(await actions.listSignals({ project })).toEqual({
      failures: [],
      signals: [
        {
          url: signal.url,
          title: signal.title,
          text: 'It takes five seconds to open.',
          date: '2026-10-02',
          source: 'github',
          insight: { id: 'I2', title: 'Long lists are slow' },
        },
      ],
      groups: [],
    })
  })

  it('answers a Signal that grew into an Insight already as a failure', async () => {
    await requests.addSignalInsight()

    expect(await requests.addSignalInsight()).toEqual({
      message: `"${signal.url}" grew into I2 already`,
    })
  })

  it('adds a Concept', async () => {
    expect(await requests.addConcept()).toEqual({ slug: 'checkout' })
    expect((await readProject()).concepts).toEqual(['checkout'])
  })

  it('answers a Concept that exists already as a failure', async () => {
    await requests.addConcept()

    expect(await requests.addConcept()).toEqual({
      message: 'concept "checkout" exists already',
    })
  })

  it('adds a Part to a Concept', async () => {
    await requests.addConcept()

    const saved = await actions.addPart({
      project,
      part: { type: 'flow', title: 'Pay the cart', concept: 'checkout' },
    })

    expect(saved).toEqual({ id: 'F1', issueMissing: false })
    expect(await findPart(db, project, 'F1')).toMatchObject({
      title: 'Pay the cart',
      concept: 'checkout',
    })
    expect(fake.issues).toEqual([])
  })

  it('keeps the Decision and says that the issue is missing when GitHub fails', async () => {
    github = failingGithub

    const saved = await actions.addPart({
      project,
      part: { ...decision, status: 'accepted' },
    })

    expect(saved).toEqual({ id: 'D1', issueMissing: true })
    expect((await findPart(db, project, 'D1'))?.status).toBe('accepted')
  })

  it('answers a Part that breaks a rule as a failure', async () => {
    const refused = await actions.addPart({
      project,
      part: { ...decision, status: 'proposed', needs: ['G1'] },
    })

    expect(refused).toEqual({
      message: 'a Decision needs evidence: an Insight or a Guardrail',
    })
  })

  it('changes the fields of a Part', async () => {
    const saved = await actions.updatePart({
      project,
      recordId: 'I1',
      change: { title: 'The build fails on type errors', status: 'draft' },
    })

    expect(saved).toEqual({ id: 'I1', issueMissing: false })
    expect(await findPart(db, project, 'I1')).toMatchObject({
      title: 'The build fails on type errors',
      status: 'draft',
    })
  })

  it('answers a change with a field of another type as a failure', async () => {
    const refused = await actions.updatePart({
      project,
      recordId: 'I1',
      change: { enforcedBy: 'verify ci' },
    })

    expect(refused).toMatchObject({
      message: expect.stringContaining('enforcedBy'),
    })
  })

  it('lists what needs the owner', async () => {
    const mine = await actions.listMine({ project })

    expect(mine).toMatchObject([{ id: 'G1', workState: 'draft' }])
  })

  it('answers a Part', async () => {
    const saved = await actions.answerPart({
      project,
      recordId: 'G1',
      answer: { answer: 'supersede' },
    })

    expect(saved).toEqual({ id: 'G1', issueMissing: false })
    expect(await findPart(db, project, 'G1')).toMatchObject({
      trust: 'solid',
      workState: 'published',
    })
  })

  it('signs an answer in words with the name of the person of the session', async () => {
    await updatePart(db, project, 'I1', { evidenceLevel: 'pattern' })
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    await actions.answerPart({
      project,
      recordId: 'D1',
      answer: { answer: 'supersede', words: 'Yes, go', by: 'Eve' },
    })

    expect((await findPart(db, project, 'D1'))?.body).toMatch(
      /^Ada, \d{4}-\d{2}-\d{2}: Yes, go$/,
    )
  })

  it('answers the question of a Decision with the name of the person of the session', async () => {
    await updatePart(db, project, 'I1', { evidenceLevel: 'pattern' })
    await actions.addPart({
      project,
      part: {
        ...decision,
        status: 'proposed',
        options: ['Before the push', 'In CI'],
        pick: 1,
      },
    })

    const saved = await actions.answerQuestion({
      project,
      recordId: 'D1',
      answer: { option: 2, by: 'Eve' },
    })

    expect(saved).toEqual({ id: 'D1', issueMissing: false })
    expect(await findPart(db, project, 'D1')).toMatchObject({
      status: 'accepted',
      question: { answer: { option: 2, text: null, by: 'Ada' } },
    })
    expect(fake.issues).toHaveLength(1)
  })

  it('answers a question that the Decision does not have as a failure', async () => {
    const refused = await actions.answerQuestion({
      project,
      recordId: 'G1',
      answer: { option: 1 },
    })

    expect(refused).toEqual({ message: expect.any(String) })
  })

  it('answers an answer that the Work state does not take as a failure', async () => {
    const refused = await actions.answerPart({
      project,
      recordId: 'I1',
      answer: { answer: 'fine' },
    })

    expect(refused).toEqual({
      message: '"I1" is published: it takes the answers not-ready, sink',
    })
  })

  it('accepts a Decision that is still proposed', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    const saved = await actions.updatePart({
      project,
      recordId: 'D1',
      change: { status: 'accepted' },
      expected: { status: 'proposed' },
    })

    expect(saved).toEqual({ id: 'D1', issueMissing: false })
    expect((await findPart(db, project, 'D1'))?.status).toBe('accepted')
  })

  it('answers a change of a Part that a second person changed as a failure, and keeps their change', async () => {
    const first = await actions.updatePart({
      project,
      recordId: 'G1',
      change: { title: 'Ship safer' },
      expected: { title: 'Ship faster', metric: 'lead time' },
    })
    const second = await actions.updatePart({
      project,
      recordId: 'G1',
      change: { title: 'Ship slower' },
      expected: { title: 'Ship faster', metric: 'lead time' },
    })

    expect(first).toEqual({ id: 'G1', issueMissing: false })
    expect(second).toEqual({ message: '"G1" changed since you opened it' })
    expect((await findPart(db, project, 'G1'))?.title).toBe('Ship safer')
  })

  it('answers a change of a Part that does not exist as a failure', async () => {
    const refused = await actions.updatePart({
      project,
      recordId: 'E7',
      change: { title: 'Cart' },
    })

    expect(refused).toEqual({ message: 'entity "E7" not found' })
  })

  it('supersedes a Decision with a new accepted Decision', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'accepted' },
    })

    const saved = await actions.addPart({
      project,
      part: {
        ...decision,
        title: 'Check the types in the editor',
        status: 'accepted',
        supersedes: 'D1',
      },
    })

    expect(saved).toEqual({ id: 'D2', issueMissing: false })
    expect(await findPart(db, project, 'D1')).toMatchObject({
      status: 'superseded',
      supersededBy: { id: 'D2' },
    })
  })

  it('answers the second Decision that supersedes the same Decision as a failure', async () => {
    const successor = {
      ...decision,
      status: 'accepted' as const,
      supersedes: 'D1',
    }
    await actions.addPart({
      project,
      part: { ...decision, status: 'accepted' },
    })
    await actions.addPart({ project, part: successor })

    expect(await actions.addPart({ project, part: successor })).toEqual({
      message: '"D1" is superseded already',
    })
    expect((await listParts(db, project, ['decision'])).length).toBe(2)
  })

  it('confirms a draft Insight', async () => {
    await addPart(db, project, {
      type: 'insight',
      title: 'Bakers ask for videos',
      source: 'comments',
      status: 'draft',
    })

    await actions.updatePart({
      project,
      recordId: 'I2',
      change: { status: null },
      expected: { status: 'draft' },
    })

    expect((await findPart(db, project, 'I2'))?.status).toBeNull()
  })

  it('discards an Insight in draft: the answer sink keeps the record', async () => {
    await addPart(db, project, {
      type: 'insight',
      title: 'Bakers ask for videos',
      source: 'comments',
      status: 'draft',
    })

    const saved = await actions.answerPart({
      project,
      recordId: 'I2',
      answer: { answer: 'sink' },
    })

    expect(saved).toEqual({ id: 'I2', issueMissing: false })
    expect(await findPart(db, project, 'I2')).toMatchObject({
      trust: 'wrong',
      workState: 'sunk',
    })
  })

  it('rejects a proposed Decision: the answer sink keeps the Decision and its Joints', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    const saved = await actions.answerPart({
      project,
      recordId: 'D1',
      answer: { answer: 'sink' },
    })
    const sunk = await findPart(db, project, 'D1')

    expect(saved).toEqual({ id: 'D1', issueMissing: false })
    expect(sunk).toMatchObject({
      status: 'superseded',
      trust: 'wrong',
      workState: 'sunk',
    })
    expect(sunk?.needs.map(({ part }) => part.id)).toEqual(['G1', 'I1'])
    expect(fake.issues).toHaveLength(0)
  })

  it('adds a Project with its root Concept', async () => {
    expect(
      await actions.addProject({ slug: 'bakeday', name: 'Bake day' }),
    ).toEqual({ slug: 'bakeday' })
    expect(await findProject(db, 'bakeday')).toMatchObject({
      slug: 'bakeday',
      name: 'Bake day',
      concept: { slug: 'bakeday', title: 'Bake day', concepts: [] },
    })
  })

  it('answers a Project that exists already as a failure', async () => {
    expect(await actions.addProject({ slug: project, name: 'Any' })).toEqual({
      message: 'project "flexibeck" exists already',
    })
  })

  it('glues two Parts with a Joint, then removes the Joint', async () => {
    const added = await requests.addJoint()
    const glued = await findPart(db, project, 'I1')
    const removed = await actions.removeJoint({ project, jointId: 1 })

    expect(added).toEqual({ id: 1 })
    expect(glued?.needs.map((end) => end.part.id)).toEqual(['G1'])
    expect(removed).toBeUndefined()
    expect((await findPart(db, project, 'I1'))?.needs).toEqual([])
  })

  it('answers a Joint that does not exist as a failure', async () => {
    expect(await actions.removeJoint({ project, jointId: 7 })).toEqual({
      message: 'joint 7 not found',
    })
  })

  it('answers a Joint of another Project as a failure, and the Joint stays', async () => {
    await addProject(db, 'glue')
    await addPart(db, 'glue', { type: 'entity', title: 'Technique' })
    await addPart(db, 'glue', { type: 'flow', title: 'Bake' })
    const id = await addJoint(db, 'glue', { part: 'F1', needs: 'E1' })

    expect(await actions.removeJoint({ project, jointId: id })).toEqual({
      message: `joint ${id} not found`,
    })
    expect(await db.select().from(schema.joints)).toHaveLength(1)
  })

  it('answers a Joint and a need with a Part that only another Project has as a failure', async () => {
    await addProject(db, 'glue')
    await addPart(db, 'glue', { type: 'entity', title: 'Technique' })
    const refused = { message: 'entity "E1" not found' }

    expect(
      await actions.addJoint({ project, joint: { part: 'I1', needs: 'E1' } }),
    ).toEqual(refused)
    expect(
      await actions.addPart({
        project,
        part: { type: 'flow', title: 'Push', needs: ['E1'] },
      }),
    ).toEqual(refused)
    expect(await db.select().from(schema.joints)).toEqual([])
  })

  it('answers a two-way Joint that gives a Decision a second Goal as a failure', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })
    await addPart(db, project, {
      type: 'goal',
      title: 'Spend less',
      metric: 'cost',
      source: 'okr',
    })

    expect(
      await actions.addJoint({
        project,
        joint: { part: 'G2', needs: 'D1', twoWay: true },
      }),
    ).toEqual({ message: '"D1" has a Goal already' })
  })

  it('answers the issue of a Decision in a change as a failure, and opens no second issue', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'accepted' },
    })

    const refused = await actions.updatePart({
      project,
      recordId: 'D1',
      // @ts-expect-error A change has no issue.
      change: { issueUrl: null },
    })

    expect(refused).toMatchObject({
      message: expect.stringContaining('issueUrl'),
    })
    expect(fake.issues).toHaveLength(1)
  })
})

describe('an Ask to another Project', () => {
  beforeEach(signIn)

  it('is picked by the member of the session', async () => {
    await addProject(db, 'ux', 'UX team')
    await addProjectReference(db, 'ux', project)
    await addPart(db, 'ux', {
      type: 'insight',
      title: 'Lists feel slow',
      source: 'study',
    })
    await addAsk(db, 'ux', { part: 'I1', toProject: project })

    expect(await actions.listMineAsks({ project })).toMatchObject([
      { id: 1, step: 'pick' },
    ])
    expect(await actions.pickAsk({ project, askId: 1 })).toBeUndefined()
    expect(await actions.listMineAsks({ project })).toMatchObject([
      { id: 1, step: 'hand-back', pickedBy: { email: 'ada@example.com' } },
    ])
    expect(await actions.startStudy({ project, askId: 1 })).toEqual({
      slug: 'study-1',
    })
    expect(await actions.startStudy({ project, askId: 1 })).toEqual({
      message: 'Ask 1 has a study already',
    })
    expect(
      await actions.findAskState({ project: 'ux', recordId: 'I1' }),
    ).toMatchObject({
      ask: { id: 1 },
      projects: [{ slug: 'flexibeck', name: 'flexibeck' }],
    })
  })

  it('is handed back only by the member who picked it', async () => {
    await addProject(db, 'ux', 'UX team')
    await addProjectReference(db, 'ux', project)
    await addPart(db, 'ux', {
      type: 'insight',
      title: 'Lists feel slow',
      source: 'study',
    })
    await addAsk(db, 'ux', { part: 'I1', toProject: project })
    await joinProject(db, project, {
      id: 'user-bo',
      name: 'Bo',
      email: 'bo@example.com',
    })
    await pickAsk(db, project, 1, 'bo@example.com')

    expect(
      await actions.handBackAsk({ project, askId: 1, part: 'I1' }),
    ).toEqual({ message: 'ada@example.com did not pick Ask 1' })
  })

  it('answers a rule that it breaks as a failure', async () => {
    expect(
      await actions.addAsk({
        project,
        ask: { kind: 'insight', part: 'I1', toProject: project },
      }),
    ).toEqual({ message: 'Project "flexibeck" cannot ask Project "flexibeck"' })
  })

  it('is made by the member of the session', async () => {
    await addProject(db, 'ux', 'UX team')
    await addProjectReference(db, project, 'ux')

    expect(
      await actions.addAsk({
        project,
        ask: {
          kind: 'decision',
          part: 'G1',
          toProject: 'ux',
          question: 'Which list do we page first?',
        },
      }),
    ).toEqual({ id: 1 })
    expect(
      await actions.findAskState({ project, recordId: 'G1' }),
    ).toMatchObject({ ask: { askedBy: { email: 'ada@example.com' } } })
  })
})

const writes = [
  'addConcept',
  'addPart',
  'updatePart',
  'answerPart',
  'addJoint',
  'removeJoint',
  'addMember',
  'setLoopSteps',
  'assign',
  'unassign',
  'watch',
  'unwatch',
  'addAsk',
  'pickAsk',
  'startStudy',
  'handBackAsk',
  'takeBackAsk',
] as const

describe('a write of a person who is no member of the Project', () => {
  beforeEach(async () => {
    await addJoint(db, project, { part: 'I1', needs: 'G1' })
    signInBo()
  })

  it.each(writes)(
    '%s answers with a failure and writes nothing',
    async (name) => {
      expect(await requests[name]()).toEqual({
        message: 'Only a member of the Project can change it.',
      })
      expect(await readProject()).toEqual({
        concepts: [],
        parts: ['I1', 'G1'],
        goal: ['Ship faster', 1, 'draft'],
      })
      expect(await listMembers(db, project)).toEqual([])
    },
  )

  it('reads the Project', async () => {
    expect((await actions.listParts({ project })).length).toBe(2)
    expect(await actions.findPeople({ project })).toEqual({
      members: [],
      assignments: [],
      watchers: [],
      me: null,
    })
    expect(await actions.listWatched({ project })).toEqual([])
  })
})

describe('the people of a Project', () => {
  beforeAll(async () => {
    await client.exec(`
      create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, name text not null, email text not null);
      insert into neon_auth."user" (id, name, email) values
        ('00000000-0000-0000-0000-000000000002', 'Bo', 'bo@example.com');
    `)
  })

  beforeEach(signIn)

  it('makes the person who adds a Project its first member', async () => {
    await requests.addProject()

    expect(await listMembers(db, 'bakeday')).toMatchObject([
      { userId: 'user-1', name: 'Ada', email: 'ada@example.com' },
    ])
  })

  it('adds a member by the e-mail address of an account', async () => {
    expect(await requests.addMember()).toMatchObject({ name: 'Bo' })
    expect(
      await actions.addMember({ project, email: 'nobody@example.com' }),
    ).toEqual({
      message: 'No account has the e-mail address nobody@example.com.',
    })
  })

  it('sets the loop steps of the member who asks', async () => {
    await requests.addMember()

    await requests.setLoopSteps()

    expect(await actions.findPeople({ project })).toMatchObject({
      members: [
        { name: 'Ada', loopSteps: ['build'] },
        { name: 'Bo', loopSteps: [] },
      ],
      me: 1,
    })
  })

  it('assigns a Part to a member and takes it back', async () => {
    await requests.assign()

    expect((await actions.findPeople({ project })).assignments).toEqual([
      { id: 1, memberId: 1, role: 'responsible', concept: null, part: 'G1' },
    ])

    await requests.unassign()

    expect(await listAssignments(db, project)).toEqual([])
  })

  it('answers with a failure for a Part that does not exist', async () => {
    expect(
      await actions.assign({
        project,
        assignment: { member: ada.email, role: 'co-author', part: 'G9' },
      }),
    ).toEqual({ message: 'G9 not found' })
  })

  it('lists for a member the Parts of the member and the Parts of nobody', async () => {
    await requests.addMember()
    await actions.assign({
      project,
      assignment: { member: 'bo@example.com', role: 'responsible', part: 'I1' },
    })

    const mine = await actions.listMine({ project })

    expect(mine.map(({ id }) => id)).toEqual(['G1'])
  })

  it('makes the member who adds a Part its owner', async () => {
    await requests.addPart()

    expect((await actions.findPeople({ project })).assignments).toEqual([
      { id: 1, memberId: 1, role: 'responsible', concept: null, part: 'F1' },
    ])
  })

  it('lets the member of the session watch a Part and stop', async () => {
    await requests.addMember()
    await actions.assign({
      project,
      assignment: { member: 'bo@example.com', role: 'responsible', part: 'G1' },
    })

    await requests.watch()

    expect((await actions.findPeople({ project })).watchers).toEqual([
      { memberId: 1, part: 'G1' },
    ])
    expect(await actions.listWatched({ project })).toMatchObject([
      { id: 'G1', flags: [] },
    ])

    await requests.unwatch()

    expect((await actions.findPeople({ project })).watchers).toEqual([])
  })

  it('answers with a failure for a watcher who answers a flag', async () => {
    await requests.addMember()
    await addPart(db, project, {
      type: 'entity',
      title: 'Build',
      needs: ['I1'],
      responsible: 'bo@example.com',
    })
    await actions.answerPart({
      project,
      recordId: 'E1',
      answer: { answer: 'supersede' },
    })
    await actions.updatePart({
      project,
      recordId: 'I1',
      change: { title: 'The build failed on a lint error' },
    })

    const refused = await actions.answerPart({
      project,
      recordId: 'E1',
      answer: { answer: 'fine' },
    })

    expect(refused).toEqual({
      message: '"E1" has a flag: only its owner Bo answers it',
    })
  })
})

describe('the input of a server function of the Part model', () => {
  it('refuses an answer that is not one of the six, and "wait" without a Part', () => {
    const unknown = answerInputSchema.safeParse({
      project,
      recordId: 'I1',
      answer: { answer: 'ok' },
    })
    const alone = answerInputSchema.safeParse({
      project,
      recordId: 'I1',
      answer: { answer: 'wait' },
    })

    expect(unknown.success).toBe(false)
    expect(alone.success).toBe(false)
  })

  it('takes only the Part types', () => {
    const listed = partListInputSchema.safeParse({ project, types: ['fact'] })

    expect(listed.success).toBe(false)
  })

  it('refuses a Part with a field that its type does not have', () => {
    const added = partAddInputSchema.safeParse({
      project,
      part: { type: 'entity', title: 'Cart', enforcedBy: 'verify ci' },
    })

    expect(added.success).toBe(false)
  })

  it('refuses an Insight with a status other than draft', () => {
    const added = partAddInputSchema.safeParse({
      project,
      part: { type: 'insight', title: 'x', source: 'y', status: 'confirmed' },
    })
    const changed = partUpdateInputSchema.safeParse({
      project,
      recordId: 'I1',
      change: { status: 'confirmed' },
    })

    expect(added.success).toBe(false)
    expect(changed.success).toBe(false)
  })

  it.each([null, 'https://github.com/timschoch/flexibeck-next/issues/7'])(
    'refuses the issue %s of a Decision',
    (issueUrl) => {
      const added = partAddInputSchema.safeParse({
        project,
        part: { ...decision, status: 'accepted', issueUrl },
      })
      const changed = partUpdateInputSchema.safeParse({
        project,
        recordId: 'D1',
        change: { issueUrl },
      })

      expect(added.success).toBe(false)
      expect(changed.success).toBe(false)
    },
  )

  it.each([1.5, '1', 'one', null])(
    'refuses %s as the id of a Joint',
    (jointId) => {
      const removed = jointRemoveInputSchema.safeParse({ project, jointId })

      expect(removed.success).toBe(false)
    },
  )
})
