import { PGlite } from '@electric-sql/pglite'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  addJoint,
  addPart,
  addProject,
  answerPart,
  removePart,
  setReading,
  supersedeDecision,
  updatePart,
} from './part-records.ts'
import { findPart, listMapJoints, listMine, listParts } from './parts.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  await addProject(db, 'glue')
})

afterAll(async () => {
  await client.close()
})

// An Insight without a status is published and solid from the start.
function addInsight(title: string, needs?: string[]) {
  return addPart(db, 'glue', {
    type: 'insight',
    title,
    source: 'interview',
    date: '2026-10-01',
    needs,
  })
}

function addDraftInsight(title: string, needs?: string[]) {
  return addPart(db, 'glue', {
    type: 'insight',
    title,
    source: 'interview',
    date: '2026-10-01',
    status: 'draft',
    needs,
  })
}

function addGoal() {
  return addPart(db, 'glue', {
    type: 'goal',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'okr',
  })
}

function addDecision(status: 'proposed' | 'accepted', needs: string[]) {
  return addPart(db, 'glue', {
    type: 'decision',
    title: 'Cache the homepage',
    date: '2026-10-02',
    owner: 'tim',
    status,
    needs,
  })
}

async function readState(recordId: string) {
  const part = await findPart(db, 'glue', recordId)
  return { trust: part?.trust, workState: part?.workState }
}

// The open flags of the Part, without their dates.
async function listFlags(recordId: string) {
  const part = await findPart(db, 'glue', recordId)
  return part?.flags.map(({ cause, reason }) => `${cause.id} ${reason}`)
}

// A database where `write` runs after the reads of a call and before its
// statement: what a second request does at the same time.
function toRacingDb(write: () => Promise<unknown>) {
  let hasWritten = false
  return new Proxy(db, {
    get(target, property) {
      if (property !== 'execute' || hasWritten)
        return Reflect.get(target, property)
      return async (statement: SQL) => {
        hasWritten = true
        await write()
        return target.execute(statement)
      }
    },
  })
}

const solid = { trust: 'solid', workState: 'published' }
const draft = { trust: 'not-ready', workState: 'draft' }
const flagged = { trust: 'flagged', workState: 'to-check' }
const sunk = { trust: 'wrong', workState: 'sunk' }

describe('the Trust and the Work state of a new Part', () => {
  it('starts as draft and not-ready', async () => {
    const id = await addPart(db, 'glue', { type: 'entity', title: 'Cart' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...draft,
      flags: [],
      waitsOn: null,
    })
  })

  it('is published and solid for an Insight without a status', async () => {
    expect(await readState(await addInsight('Loads are slow'))).toEqual(solid)
  })

  it('is draft for a draft Insight', async () => {
    const id = await addDraftInsight('Loads are slow')

    expect(await readState(id)).toEqual(draft)
  })

  it('follows the status of a Decision', async () => {
    await addGoal()
    await addInsight('Loads are slow')

    const proposed = await addDecision('proposed', ['G1', 'I1'])
    const accepted = await addDecision('accepted', ['G1', 'I1'])

    expect(await readState(proposed)).toEqual({
      trust: 'not-ready',
      workState: 'review',
    })
    expect(await readState(accepted)).toEqual(solid)
  })

  it('shows in the list of the Parts', async () => {
    await addInsight('Loads are slow')

    expect(await listParts(db, 'glue')).toMatchObject([{ id: 'I1', ...solid }])
  })
})

describe('a change of the status', () => {
  beforeEach(async () => {
    await addGoal()
    await addInsight('Loads are slow')
  })

  it('publishes the Decision that becomes accepted', async () => {
    const id = await addDecision('proposed', ['G1', 'I1'])

    await updatePart(db, 'glue', id, { status: 'accepted' })

    expect(await readState(id)).toEqual(solid)
  })

  it('puts the Decision that becomes proposed back in review', async () => {
    const id = await addDecision('accepted', ['G1', 'I1'])

    await updatePart(db, 'glue', id, { status: 'proposed' })

    expect(await readState(id)).toEqual({
      trust: 'not-ready',
      workState: 'review',
    })
  })

  it('publishes the draft Insight that is kept', async () => {
    const id = await addDraftInsight('Bakers want videos')

    await updatePart(db, 'glue', id, { status: null })

    expect(await readState(id)).toEqual(solid)
  })

  it('sinks the Decision that another one supersedes', async () => {
    const old = await addDecision('accepted', ['G1', 'I1'])
    const successor = await addDecision('accepted', ['G1', 'I1'])

    await supersedeDecision(db, 'glue', old, successor)

    expect(await readState(old)).toEqual(sunk)
  })

  it('sinks the Decision that a new one supersedes', async () => {
    const old = await addDecision('accepted', ['G1', 'I1'])

    await addPart(db, 'glue', {
      type: 'decision',
      title: 'Cache each page',
      owner: 'tim',
      status: 'accepted',
      needs: ['G1', 'I1'],
      supersedes: old,
    })

    expect(await readState(old)).toEqual(sunk)
  })

  it('keeps the state when the status stays the same', async () => {
    const id = await addDecision('accepted', ['G1', 'I1'])
    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    await updatePart(db, 'glue', id, { status: 'accepted' })

    expect(await readState(id)).toEqual(flagged)
  })

  it('closes the flags of the Decision that becomes sunk', async () => {
    const old = await addDecision('accepted', ['G1', 'I1'])
    const successor = await addDecision('accepted', ['G1', 'I1'])
    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    await supersedeDecision(db, 'glue', old, successor)

    expect(await listFlags(old)).toEqual([])
  })
})

describe('the automatic flag', () => {
  it('flags the Part that needs a published Part with a new title', async () => {
    await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await findPart(db, 'glue', needing)).toMatchObject({
      ...flagged,
      flags: [
        {
          cause: { id: 'I1', title: 'Loads are very slow' },
          reason: 'changed',
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
    })
    expect(await readState('I1')).toEqual(solid)
  })

  it('flags for a new body', async () => {
    await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', { body: 'Three seconds and more.' })

    expect(await listFlags(needing)).toEqual(['I1 changed'])
  })

  it('flags nothing when the title and the body stay', async () => {
    await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', {
      title: 'Loads are slow',
      source: 'survey',
    })

    expect(await readState(needing)).toEqual(solid)
  })

  it('flags nobody for a new title and a new body with the same meaning, and saves them', async () => {
    await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', {
      title: 'Pages load slowly',
      body: 'Three seconds and more.',
      sameMeaning: true,
    })

    expect(await findPart(db, 'glue', needing)).toMatchObject({
      ...solid,
      flags: [],
    })
    expect(await findPart(db, 'glue', 'I1')).toMatchObject({
      ...solid,
      title: 'Pages load slowly',
      body: 'Three seconds and more.',
    })
  })

  it('writes the wording fix in the activity of the Part', async () => {
    await addInsight('Loads are slow')

    await updatePart(db, 'glue', 'I1', {
      title: 'Pages load slowly',
      sameMeaning: true,
    })

    const part = await findPart(db, 'glue', 'I1')
    expect(part?.activity.map(({ kind }) => kind)).toEqual([
      'wording',
      'published',
    ])
  })

  it('writes no wording fix when the title and the body stay', async () => {
    await addInsight('Loads are slow')

    await updatePart(db, 'glue', 'I1', {
      title: 'Loads are slow',
      source: 'survey',
      sameMeaning: true,
    })

    const part = await findPart(db, 'glue', 'I1')
    expect(part?.activity.map(({ kind }) => kind)).toEqual([
      'changed',
      'published',
    ])
  })

  it('still flags for a status that turns the Part not ready in the same write', async () => {
    await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', {
      title: 'Pages load slowly',
      status: 'draft',
      sameMeaning: true,
    })

    expect(await listFlags(needing)).toEqual(['I1 not-ready'])
  })

  it('flags in both directions over a two-way Joint', async () => {
    await addInsight('Loads are slow')
    await addInsight('Users churn')
    await addJoint(db, 'glue', { part: 'I1', needs: 'I2', twoWay: true })

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await listFlags('I2')).toEqual(['I1 changed'])
    expect(await listFlags('I1')).toEqual([])
  })

  it('does not flag the Part that the changed Part needs', async () => {
    await addInsight('Loads are slow')
    await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I2', { title: 'Users leave' })

    expect(await readState('I1')).toEqual(solid)
  })

  it('goes one step only', async () => {
    await addInsight('Loads are slow')
    await addInsight('Users churn', ['I1'])
    await addInsight('Revenue drops', ['I2'])

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await readState('I2')).toEqual(flagged)
    expect(await readState('I3')).toEqual(solid)
  })

  it('does not flag a Part that is draft', async () => {
    await addInsight('Loads are slow')
    const needing = await addDraftInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await findPart(db, 'glue', needing)).toMatchObject({
      ...draft,
      flags: [],
    })
  })

  it('does not flag a Part that is sunk', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const old = await addDecision('accepted', ['G1', 'I1'])
    await supersedeDecision(
      db,
      'glue',
      old,
      await addDecision('accepted', ['G1', 'I1']),
    )

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await findPart(db, 'glue', old)).toMatchObject({
      ...sunk,
      flags: [],
    })
  })

  it('does not flag for the change of a Part that is not published', async () => {
    await addDraftInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await readState(needing)).toEqual(solid)
  })

  it('keeps one open flag for the same cause and reason', async () => {
    await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', ['I1'])

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })
    await updatePart(db, 'glue', 'I1', { title: 'Loads take three seconds' })

    expect(await listFlags(needing)).toEqual(['I1 changed'])
  })

  it('adds a second flag for a second reason', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const cause = await addDecision('accepted', ['G1', 'I1'])
    const needing = await addInsight('Users churn', [cause])

    await updatePart(db, 'glue', cause, { title: 'Cache each page' })
    await answerPart(db, 'glue', cause, { answer: 'not-ready' })

    expect(await listFlags(needing)).toEqual([
      `${cause} changed`,
      `${cause} not-ready`,
    ])
  })

  it('flags with the reason wrong when a needed Part is sunk', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const old = await addDecision('accepted', ['G1', 'I1'])
    const needing = await addInsight('Users churn', [old])

    await supersedeDecision(
      db,
      'glue',
      old,
      await addDecision('accepted', ['G1', 'I1']),
    )

    expect(await listFlags(needing)).toEqual([`${old} wrong`])
    expect(await readState(needing)).toEqual(flagged)
  })

  it('keeps a Part in review in review, and lists the flag', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const proposed = await addDecision('proposed', ['G1', 'I1'])

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect(await findPart(db, 'glue', proposed)).toMatchObject({
      trust: 'not-ready',
      workState: 'review',
      flags: [{ cause: { id: 'I1' }, reason: 'changed' }],
    })
  })
})

// I1 is published. I2 needs I1 and is flagged, because I1 got a new title.
async function addFlaggedInsight() {
  await addInsight('Loads are slow')
  const id = await addInsight('Users churn', ['I1'])
  await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })
  return id
}

describe('the answer of the owner', () => {
  it('makes a flagged Part solid again with "fine", and closes its flags', async () => {
    const id = await addFlaggedInsight()

    await answerPart(db, 'glue', id, { answer: 'fine' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      flags: [],
    })
  })

  it('makes the Part wait on a Part with "wait", and keeps its flags', async () => {
    const id = await addFlaggedInsight()

    await answerPart(db, 'glue', id, { answer: 'wait', waitsOn: 'I1' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      trust: 'flagged',
      workState: 'waiting',
      flags: [{ cause: { id: 'I1', title: 'Loads are very slow' } }],
      waitsOn: { id: 'I1', title: 'Loads are very slow', ...solid },
    })
  })

  it('refuses "wait" without the awaited Part', async () => {
    const id = await addFlaggedInsight()

    await expect(
      // @ts-expect-error: `wait` needs `waitsOn`
      answerPart(db, 'glue', id, { answer: 'wait' }),
    ).rejects.toThrow('waitsOn')
  })

  it('refuses to wait on the Part itself', async () => {
    const id = await addFlaggedInsight()

    await expect(
      answerPart(db, 'glue', id, { answer: 'wait', waitsOn: id }),
    ).rejects.toThrow('a Part cannot wait on itself')
  })

  it('refuses to wait on a sunk Part', async () => {
    const id = await addFlaggedInsight()
    const other = await addInsight('Revenue drops')
    await answerPart(db, 'glue', other, { answer: 'sink' })

    await expect(
      answerPart(db, 'glue', id, { answer: 'wait', waitsOn: other }),
    ).rejects.toThrow(`"${other}" is sunk`)
  })

  it('refuses to wait on a Part that is sunk after the read', async () => {
    const id = await addFlaggedInsight()
    const other = await addInsight('Revenue drops')
    const racing = toRacingDb(() =>
      answerPart(db, 'glue', other, { answer: 'sink' }),
    )

    await expect(
      answerPart(racing, 'glue', id, { answer: 'wait', waitsOn: other }),
    ).rejects.toThrow(`"${other}" is sunk`)
    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...flagged,
      waitsOn: null,
    })
  })

  it('refuses to wait on a Part of another Project', async () => {
    const id = await addFlaggedInsight()
    await addProject(db, 'flexibeck')
    const other = await addPart(db, 'flexibeck', {
      type: 'entity',
      title: 'Recipe',
    })

    await expect(
      answerPart(db, 'glue', id, { answer: 'wait', waitsOn: other }),
    ).rejects.toThrow(`"${other}" not found`)
    expect(await readState(id)).toEqual(flagged)
  })

  it('makes the Part a draft with "need-time", and keeps its Trust', async () => {
    const id = await addFlaggedInsight()

    await answerPart(db, 'glue', id, { answer: 'need-time' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      trust: 'flagged',
      workState: 'draft',
      flags: [],
    })
  })

  it('makes the Part a draft that is not ready with "not-ready"', async () => {
    const id = await addInsight('Loads are slow')
    const needing = await addInsight('Users churn', [id])

    await answerPart(db, 'glue', id, { answer: 'not-ready' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...draft,
      status: 'draft',
    })
    expect(await listFlags(needing)).toEqual([`${id} not-ready`])
    expect(await readState(needing)).toEqual(flagged)
  })

  it('keeps the status of a Decision with "not-ready"', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const id = await addDecision('accepted', ['G1', 'I1'])

    await answerPart(db, 'glue', id, { answer: 'not-ready' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...draft,
      status: 'accepted',
    })
  })

  it('publishes a draft with "supersede"', async () => {
    const id = await addDraftInsight('Loads are slow')

    await answerPart(db, 'glue', id, { answer: 'supersede' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      status: null,
    })
  })

  it('accepts a Decision in review with "supersede"', async () => {
    await addGoal()
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'Loads are slow',
      source: 'interview',
      date: '2026-10-01',
      evidenceLevel: 'pattern',
    })
    const id = await addDecision('proposed', ['G1', 'I1'])

    await answerPart(db, 'glue', id, { answer: 'supersede' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      status: 'accepted',
    })
  })

  it('takes a draft to review with "ready", and keeps its Trust', async () => {
    const id = await addPart(db, 'glue', { type: 'entity', title: 'Cart' })

    await answerPart(db, 'glue', id, { answer: 'ready' })

    expect(await readState(id)).toEqual({
      trust: 'not-ready',
      workState: 'review',
    })
  })

  it('publishes a Part in review with "supersede"', async () => {
    const id = await addDraftInsight('Loads are slow')
    await answerPart(db, 'glue', id, { answer: 'ready' })

    await answerPart(db, 'glue', id, { answer: 'supersede' })

    expect(await readState(id)).toEqual(solid)
  })

  it('makes a draft Decision proposed with "ready"', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const id = await addDecision('accepted', ['G1', 'I1'])
    await answerPart(db, 'glue', id, { answer: 'not-ready' })

    await answerPart(db, 'glue', id, { answer: 'ready' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      trust: 'not-ready',
      workState: 'review',
      status: 'proposed',
    })
  })

  it('keeps a draft Insight a draft with "ready"', async () => {
    const id = await addDraftInsight('Loads are slow')

    await answerPart(db, 'glue', id, { answer: 'ready' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      trust: 'not-ready',
      workState: 'review',
      status: 'draft',
    })
  })

  it('sinks the Part with "sink", and flags the Parts that need it', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const id = await addDecision('accepted', ['G1', 'I1'])
    const needing = await addInsight('Users churn', [id])

    await answerPart(db, 'glue', id, { answer: 'sink' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...sunk,
      status: 'superseded',
      supersededBy: null,
    })
    expect(await listFlags(needing)).toEqual([`${id} wrong`])
  })

  it('keeps the status of a Part whose type has no status for the answer', async () => {
    const id = await addGoal()

    await answerPart(db, 'glue', id, { answer: 'supersede' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      status: 'open',
    })
  })

  it('refuses an answer that the Work state does not take, and names the ones that it takes', async () => {
    const id = await addInsight('Loads are slow')

    await expect(
      answerPart(db, 'glue', id, { answer: 'fine' }),
    ).rejects.toThrow(
      `"${id}" is published: it takes the answers not-ready, sink`,
    )
    expect(await readState(id)).toEqual(solid)
  })

  it('refuses each answer to a sunk Part', async () => {
    const id = await addInsight('Loads are slow')
    await answerPart(db, 'glue', id, { answer: 'sink' })

    await expect(
      answerPart(db, 'glue', id, { answer: 'not-ready' }),
    ).rejects.toThrow(`"${id}" is sunk: it takes no answer`)
  })

  it('refuses an answer that is not one of the six', async () => {
    const id = await addFlaggedInsight()

    await expect(
      // @ts-expect-error: not an answer
      answerPart(db, 'glue', id, { answer: 'ok' }),
    ).rejects.toThrow('answer')
  })

  it('refuses a Part that the Project does not have', async () => {
    await expect(
      answerPart(db, 'glue', 'I9', { answer: 'sink' }),
    ).rejects.toThrow('I9')
  })
})

describe('a Part that is published again', () => {
  it('flags the Parts that need it with the reason changed', async () => {
    const id = await addFlaggedInsight()
    const needing = await addInsight('Revenue drops', [id])
    await answerPart(db, 'glue', id, { answer: 'need-time' })
    await updatePart(db, 'glue', id, { body: 'One in ten leaves.' })

    expect(await readState(needing)).toEqual(solid)

    await answerPart(db, 'glue', id, { answer: 'supersede' })

    expect(await listFlags(needing)).toEqual([`${id} changed`])
    expect(await readState(needing)).toEqual(flagged)
  })

  it('flags them when a Decision is accepted again', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const id = await addDecision('accepted', ['G1', 'I1'])
    const needing = await addInsight('Users churn', [id])
    await updatePart(db, 'glue', id, { status: 'proposed' })

    await updatePart(db, 'glue', id, { status: 'accepted' })

    expect(await listFlags(needing)).toEqual([`${id} changed`])
    expect(await findPart(db, 'glue', needing)).toMatchObject({
      ...flagged,
      reviewNotes: [],
    })
  })

  it('flags nobody with the first sign-off of a Part', async () => {
    const id = await addDraftInsight('Loads are slow')
    const needing = await addInsight('Users churn', [id])

    await answerPart(db, 'glue', id, { answer: 'supersede' })

    expect(await findPart(db, 'glue', needing)).toMatchObject({
      ...solid,
      flags: [],
    })
  })
})

describe('a write at the same time as an answer', () => {
  it('refuses the answer to a Part that changed after the read, and keeps its flags', async () => {
    const id = await addFlaggedInsight()
    await addInsight('Revenue drops')
    await addJoint(db, 'glue', { part: id, needs: 'I3' })
    // The clock of PGlite is coarse: two writes can get the same time.
    await client.exec("update parts set changed_at = now() - interval '1 hour'")
    const racing = toRacingDb(() =>
      updatePart(db, 'glue', 'I3', { title: 'Revenue drops fast' }),
    )

    await expect(
      answerPart(racing, 'glue', id, { answer: 'fine' }),
    ).rejects.toThrow('changed at the same time')
    expect(await readState(id)).toEqual(flagged)
    expect(await listFlags(id)).toEqual(['I1 changed', 'I3 changed'])
  })

  it('flags a published Part again that kept an open flag of the cause', async () => {
    const id = await addFlaggedInsight()
    await client.exec(
      "update parts set trust = 'solid', work_state = 'published' where record_id = 'I2'",
    )

    await updatePart(db, 'glue', 'I1', { title: 'Loads take three seconds' })

    expect(await readState(id)).toEqual(flagged)
    expect(await listFlags(id)).toEqual(['I1 changed'])
  })
})

describe('a Part that waits', () => {
  // I2 is flagged and waits on I3.
  beforeEach(async () => {
    await addFlaggedInsight()
    await addInsight('Revenue drops')
    await answerPart(db, 'glue', 'I2', { answer: 'wait', waitsOn: 'I3' })
  })

  const toCheck = { ...flagged, waitsOn: null }

  it('is back in to-check when the awaited Part changes', async () => {
    await updatePart(db, 'glue', 'I3', { body: 'Ten percent in a month.' })

    expect(await findPart(db, 'glue', 'I2')).toMatchObject(toCheck)
  })

  it('is back in to-check when the awaited Part gets an answer', async () => {
    await answerPart(db, 'glue', 'I3', { answer: 'not-ready' })

    expect(await findPart(db, 'glue', 'I2')).toMatchObject(toCheck)
  })

  it('is back in to-check when the awaited Part is sunk', async () => {
    await answerPart(db, 'glue', 'I3', { answer: 'sink' })

    expect(await findPart(db, 'glue', 'I2')).toMatchObject(toCheck)
  })

  it('is back in to-check when the awaited Part is removed', async () => {
    await removePart(db, 'glue', 'I3')

    expect(await findPart(db, 'glue', 'I2')).toMatchObject(toCheck)
  })

  it('waits on when the title and the body of the awaited Part stay', async () => {
    await updatePart(db, 'glue', 'I3', { source: 'survey' })

    expect(await findPart(db, 'glue', 'I2')).toMatchObject({
      workState: 'waiting',
      waitsOn: { id: 'I3' },
    })
  })

  it('waits on when the awaited Part gets a new body with the same meaning', async () => {
    await updatePart(db, 'glue', 'I3', {
      body: 'Ten percent in a month.',
      sameMeaning: true,
    })

    expect(await findPart(db, 'glue', 'I2')).toMatchObject({
      workState: 'waiting',
      waitsOn: { id: 'I3' },
    })
  })

  it('takes "not-ready" and "sink" only', async () => {
    await expect(
      answerPart(db, 'glue', 'I2', { answer: 'fine' }),
    ).rejects.toThrow('"I2" is waiting: it takes the answers not-ready, sink')
  })
})

describe('an answer in words', () => {
  async function addProposedDecision() {
    await addGoal()
    await addPart(db, 'glue', {
      type: 'insight',
      title: 'Loads are slow',
      source: 'interview',
      date: '2026-10-01',
      evidenceLevel: 'pattern',
    })
    return addDecision('proposed', ['G1', 'I1'])
  }

  it('goes to the end of the body with the name and the date, and the Decision is signed off', async () => {
    const id = await addProposedDecision()
    await updatePart(db, 'glue', id, { body: 'Option 1 or option 2?' })

    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
    try {
      await answerPart(db, 'glue', id, {
        answer: 'supersede',
        words: 'Take option 2',
        by: 'Tim',
      })
    } finally {
      vi.useRealTimers()
    }

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      status: 'accepted',
      body: 'Option 1 or option 2?\n\nTim, 2026-10-03: Take option 2',
    })
  })

  it('is the whole body of a Part without one, and the Decision is sunk', async () => {
    const id = await addProposedDecision()

    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
    try {
      await answerPart(db, 'glue', id, {
        answer: 'sink',
        words: 'Neither',
        by: 'Tim',
      })
    } finally {
      vi.useRealTimers()
    }

    expect(await findPart(db, 'glue', id)).toMatchObject({
      workState: 'sunk',
      body: 'Tim, 2026-10-03: Neither',
    })
  })

  it('needs the name of the person', async () => {
    const id = await addProposedDecision()

    await expect(
      answerPart(db, 'glue', id, { answer: 'supersede', words: 'Yes' }),
    ).rejects.toThrow('"words" needs "by"')
  })
})

describe('the answers that a Part takes', () => {
  it('are the ones of its Work state', async () => {
    const id = await addFlaggedInsight()

    expect((await findPart(db, 'glue', id))?.answers).toEqual([
      'fine',
      'wait',
      'need-time',
      'not-ready',
      'sink',
    ])
    expect((await findPart(db, 'glue', 'I1'))?.answers).toEqual([
      'not-ready',
      'sink',
    ])
  })

  it('has the sign-off first and "ready" for a draft, and no "ready" in review', async () => {
    const id = await addPart(db, 'glue', { type: 'entity', title: 'Cart' })

    expect((await findPart(db, 'glue', id))?.answers).toEqual([
      'supersede',
      'ready',
      'not-ready',
      'sink',
    ])

    await answerPart(db, 'glue', id, { answer: 'ready' })

    expect((await findPart(db, 'glue', id))?.answers).toEqual([
      'supersede',
      'not-ready',
      'sink',
    ])
  })
})

describe('the list of what needs the owner', () => {
  it('has the Parts in to-check, draft and review, the newest change first', async () => {
    await addGoal()
    await addFlaggedInsight()
    await addDraftInsight('Revenue drops')
    await addDecision('proposed', ['G1', 'I1'])
    await addDecision('accepted', ['G1', 'I1'])

    expect(
      (await listMine(db, 'glue')).map(({ id, workState }) => [id, workState]),
    ).toEqual([
      ['D1', 'review'],
      ['I3', 'draft'],
      ['I2', 'to-check'],
      ['G1', 'draft'],
    ])
  })

  it('puts a Part with a new change first', async () => {
    await addDraftInsight('Loads are slow')
    await addDraftInsight('Users churn')

    await client.exec("update parts set changed_at = now() - interval '1 hour'")

    await updatePart(db, 'glue', 'I1', { title: 'Loads are very slow' })

    expect((await listMine(db, 'glue')).map(({ id }) => id)).toEqual([
      'I1',
      'I2',
    ])
  })

  it('has no Part of another Project', async () => {
    await addProject(db, 'flexibeck')
    await addPart(db, 'flexibeck', { type: 'entity', title: 'Recipe' })

    expect(await listMine(db, 'glue')).toEqual([])
  })
})

describe('a reading of a Metric', () => {
  // A Metric with a target of 25%, and an accepted Decision that needs it.
  async function addMeasuredDecision() {
    await addGoal()
    await addInsight('Loads are slow')
    await addPart(db, 'glue', {
      type: 'metric',
      title: 'Signup to paid',
      measure: {
        kind: 'funnel',
        source: 'mock-analytics',
        steps: ['signed-up', 'paid'],
        target: 0.25,
        window_days: 7,
      },
    })
    return addDecision('accepted', ['G1', 'I1', 'M1'])
  }

  function read(latestValue: number) {
    return setReading(db, 'glue', 'M1', {
      baseline: null,
      latestValue,
      latestBreakdownValue: null,
      measuredAt: new Date('2026-10-03T08:00:00Z'),
    })
  }

  it('flags the Parts that need the Metric when it misses its target', async () => {
    const id = await addMeasuredDecision()

    await read(0.1)

    expect(await listFlags(id)).toEqual(['M1 off-target'])
    expect(await readState(id)).toEqual({
      trust: 'flagged',
      workState: 'to-check',
    })
    expect((await findPart(db, 'glue', 'M1'))?.measure).toMatchObject({
      latestValue: 0.1,
      target: 0.25,
      onTarget: false,
      measuredAt: '2026-10-03T08:00:00.000Z',
    })
  })

  it('flags nothing when it reaches its target', async () => {
    const id = await addMeasuredDecision()

    await read(0.3)

    expect(await listFlags(id)).toEqual([])
    expect(await readState(id)).toEqual(solid)
  })

  it('flags once while the readings stay off target', async () => {
    const id = await addMeasuredDecision()
    await read(0.1)
    await answerPart(db, 'glue', id, { answer: 'fine' })

    await read(0.12)

    expect(await listFlags(id)).toEqual([])
    expect(await readState(id)).toEqual(solid)
  })

  it('flags again when it misses its target after it reached it', async () => {
    const id = await addMeasuredDecision()
    await read(0.1)
    await answerPart(db, 'glue', id, { answer: 'fine' })
    await read(0.3)

    await read(0.1)

    expect(await listFlags(id)).toEqual(['M1 off-target'])
  })

  it('refuses a Part without a measure', async () => {
    await addGoal()

    await expect(
      setReading(db, 'glue', 'G1', {
        baseline: null,
        latestValue: 1,
        latestBreakdownValue: null,
        measuredAt: new Date(),
      }),
    ).rejects.toThrow('"G1" has no measure')
  })
})

// A published Part of the type, with no Joint.
async function addPublished(type: 'entity' | 'flow', title: string) {
  const id = await addPart(db, 'glue', { type, title })
  await answerPart(db, 'glue', id, { answer: 'supersede' })
  return id
}

describe('an empty slot', () => {
  it('shows a published Entity with no Decision as flagged, with the slot', async () => {
    const id = await addPublished('entity', 'Cart')

    expect(await findPart(db, 'glue', id)).toMatchObject({
      trust: 'flagged',
      workState: 'published',
      emptySlots: ['decision'],
      flags: [],
    })
  })

  it('shows in the list of the Parts, and not in Mine', async () => {
    await addPublished('flow', 'Checkout')

    expect(await listParts(db, 'glue')).toMatchObject([
      { id: 'F1', trust: 'flagged', emptySlots: ['decision'] },
    ])
    expect(await listMine(db, 'glue')).toEqual([])
  })

  it('is filled by a Joint to a Decision', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const decision = await addDecision('accepted', ['G1', 'I1'])
    const id = await addPublished('entity', 'Cart')

    await addJoint(db, 'glue', { part: id, needs: decision })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      emptySlots: [],
    })
    expect(await listParts(db, 'glue', ['entity'])).toMatchObject([
      { id, trust: 'solid', emptySlots: [] },
    ])
  })

  it('is filled by a two-way Joint from the other side', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const decision = await addDecision('accepted', ['G1', 'I1'])
    const id = await addPublished('entity', 'Cart')

    await addJoint(db, 'glue', { part: decision, needs: id, twoWay: true })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...solid,
      emptySlots: [],
    })
  })

  it('keeps a draft red, and lists its slot', async () => {
    const id = await addPart(db, 'glue', { type: 'entity', title: 'Cart' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...draft,
      emptySlots: ['decision'],
    })
  })

  it('has none on a sunk Part', async () => {
    const id = await addPublished('entity', 'Cart')

    await answerPart(db, 'glue', id, { answer: 'sink' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      ...sunk,
      emptySlots: [],
    })
  })

  it('goes one step only: the Part that needs the unsure Part stays solid', async () => {
    const id = await addPublished('entity', 'Cart')
    const needing = await addInsight('Carts are left', [id])

    expect(await findPart(db, 'glue', needing)).toMatchObject({
      ...solid,
      emptySlots: [],
      flags: [],
      needs: [{ part: { id, trust: 'flagged' } }],
    })
  })

  it('lists a Goal and evidence for a Decision that has neither', async () => {
    await addGoal()
    await addInsight('Loads are slow')
    const id = await addDecision('accepted', ['G1', 'I1'])
    // A Decision from before the rule that it needs both.
    await client.exec('delete from joints')

    expect(await findPart(db, 'glue', id)).toMatchObject({
      trust: 'flagged',
      emptySlots: ['goal', 'evidence'],
    })
  })

  it('shows the Trust of the needed Part on a Joint of the Map', async () => {
    const id = await addPublished('entity', 'Cart')
    await addInsight('Carts are left', [id])

    expect(await listMapJoints(db, 'glue')).toMatchObject([
      { part: 'I1', needs: id, trust: 'flagged' },
    ])
  })
})

describe('the note for a review', () => {
  const note = { id: 'D1', type: 'decision', title: 'Cache the homepage' }

  beforeEach(async () => {
    await addGoal()
    await addInsight('Loads are slow')
  })

  it('shows on the Part that needs a Part in review, and keeps it solid', async () => {
    await addDecision('proposed', ['G1', 'I1'])
    const id = await addPublished('entity', 'Cart')

    await addJoint(db, 'glue', { part: id, needs: 'D1' })

    const part = await findPart(db, 'glue', id)
    expect(part).toMatchObject({ ...solid, flags: [] })
    expect(part?.reviewNotes).toEqual([note])
  })

  it('shows in the list of the Parts, and not in Mine', async () => {
    await addDecision('proposed', ['G1', 'I1'])
    const id = await addInsight('Users churn', ['D1'])

    const listed = await listParts(db, 'glue', ['insight'])
    expect(listed.map((part) => [part.id, part.reviewNotes])).toEqual([
      ['I1', []],
      [id, [note]],
    ])
    const mine = await listMine(db, 'glue')
    expect(mine.map((part) => part.id)).not.toContain(id)
  })

  it('does not show on the Part that the Part in review needs', async () => {
    await addDecision('proposed', ['G1', 'I1'])

    expect((await findPart(db, 'glue', 'I1'))?.reviewNotes).toEqual([])
  })

  it('shows on both Parts of a two-way Joint', async () => {
    await addDecision('proposed', ['G1', 'I1'])
    const id = await addInsight('Users churn')

    await addJoint(db, 'glue', { part: 'D1', needs: id, twoWay: true })

    expect((await findPart(db, 'glue', id))?.reviewNotes).toEqual([note])
  })

  it('goes away when the review ends', async () => {
    await addDecision('proposed', ['G1', 'I1'])
    const id = await addInsight('Users churn', ['D1'])

    await updatePart(db, 'glue', 'D1', { status: 'accepted' })

    const part = await findPart(db, 'glue', id)
    expect(part).toMatchObject({ ...solid, flags: [] })
    expect(part?.reviewNotes).toEqual([])
  })

  it('takes the place of a flag when a published Part goes to review', async () => {
    await addDecision('accepted', ['G1', 'I1'])
    const id = await addInsight('Users churn', ['D1'])

    await updatePart(db, 'glue', 'D1', { status: 'proposed' })

    const part = await findPart(db, 'glue', id)
    expect(part).toMatchObject({ ...solid, flags: [] })
    expect(part?.reviewNotes).toEqual([note])
  })
})
