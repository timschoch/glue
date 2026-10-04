import { PGlite } from '@electric-sql/pglite'
import { isRedirect } from '@tanstack/react-router'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../authentication/session.ts'
import type { GithubClient } from '../github/client.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import { setProductRepository } from './concept-records.ts'
import {
  answerInputSchema,
  createPartActions,
  jointRemoveInputSchema,
  partAddInputSchema,
  partListInputSchema,
  partUpdateInputSchema,
} from './part-actions.ts'
import { addJoint, addPart, addProject } from './part-records.ts'
import { findPart, findProject, listParts } from './parts.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

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

beforeEach(async () => {
  session = undefined
  fake = createFakeGithub()
  github = fake.github
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
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

afterEach(async () => {
  await client.close()
})

function signIn() {
  session = { user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' } }
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
  listMine: () => actions.listMine({ project }),
  removePart: () => actions.removePart({ project, recordId: 'I1' }),
  addJoint: () =>
    actions.addJoint({ project, joint: { part: 'I1', needs: 'G1' } }),
  removeJoint: () => actions.removeJoint({ project, jointId: 1 }),
  addProject: () => actions.addProject({ slug: 'bakeday' }),
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

  it('opens the downstream issue of a Decision that it adds as accepted', async () => {
    const saved = await actions.addPart({
      project,
      part: { ...decision, status: 'accepted' },
    })

    expect(saved).toEqual({ id: 'D1', issueMissing: false })
    expect(fake.issues).toHaveLength(1)
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

  it('opens the downstream issue when it accepts a Decision', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    const saved = await actions.updatePart({
      project,
      recordId: 'D1',
      change: { status: 'accepted' },
    })

    expect(saved).toEqual({ id: 'D1', issueMissing: false })
    expect(fake.issues).toHaveLength(1)
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

  it('opens the downstream issue when the answer accepts a Decision', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    const saved = await actions.answerPart({
      project,
      recordId: 'D1',
      answer: { answer: 'supersede' },
    })

    expect(saved).toEqual({ id: 'D1', issueMissing: false })
    expect(fake.issues).toHaveLength(1)
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

  it('answers the accept of a Decision that is accepted already as a failure, and opens no second issue', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'accepted' },
    })

    const refused = await actions.updatePart({
      project,
      recordId: 'D1',
      change: { status: 'accepted' },
      expected: { status: 'proposed' },
    })

    expect(refused).toEqual({ message: '"D1" changed since you opened it' })
    expect(fake.issues).toHaveLength(1)
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

  it('removes a Part that is in the expected state', async () => {
    await addPart(db, project, {
      type: 'insight',
      title: 'Bakers ask for videos',
      source: 'comments',
      status: 'draft',
    })

    const removed = await actions.removePart({
      project,
      recordId: 'I2',
      expected: { status: 'draft' },
    })

    expect(removed).toBeUndefined()
    expect(await findPart(db, project, 'I2')).toBeUndefined()
  })

  it('answers the removal of a Part that a second person changed as a failure, and the Part stays', async () => {
    const refused = await actions.removePart({
      project,
      recordId: 'I1',
      expected: { status: 'draft' },
    })

    expect(refused).toEqual({ message: '"I1" changed since you opened it' })
    expect(await findPart(db, project, 'I1')).toBeDefined()
  })

  it('answers the removal of a Part that another Part needs as a failure, and the Part stays', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    const refused = await actions.removePart({ project, recordId: 'I1' })

    expect(refused).toEqual({ message: '"I1" is needed by D1' })
    expect(await findPart(db, project, 'I1')).toBeDefined()
  })

  it('rejects a proposed Decision: the Decision goes away with its Joints', async () => {
    await actions.addPart({
      project,
      part: { ...decision, status: 'proposed' },
    })

    const removed = await actions.removePart({
      project,
      recordId: 'D1',
      expected: { status: 'proposed' },
    })

    expect(removed).toBeUndefined()
    expect(await readProject()).toMatchObject({
      parts: ['I1', 'G1'],
      goal: ['Ship faster', 0],
    })
  })

  it('adds a Project with its root Concept', async () => {
    expect(await actions.addProject({ slug: 'bakeday' })).toEqual({
      slug: 'bakeday',
    })
    expect(await findProject(db, 'bakeday')).toMatchObject({
      slug: 'bakeday',
      concept: { slug: 'bakeday', concepts: [] },
    })
  })

  it('answers a Project that exists already as a failure', async () => {
    expect(await actions.addProject({ slug: project })).toEqual({
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
