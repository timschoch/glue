import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addAsk,
  findOpenAsk,
  handBackAsk,
  listAskableProjects,
  listMineAsks,
  pickAsk,
} from './asks.ts'
import { joinProject } from './members.ts'
import { addJoint, addPart, addProject, updatePart } from './part-records.ts'
import { findPart } from './parts.ts'
import { addProjectReference } from './projects.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const mara = 'mara@example.com'
const fred = 'fred@example.com'
const uma = 'uma@example.com'

// Project `bakeday` may reference Project `ux`. Mara is the member of
// `bakeday` and owns its Hunch I1. Fred and Uma are the members of `ux`.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
  await addProject(db, 'bakeday', 'Bakeday')
  await addProject(db, 'ux', 'UX team')
  await addProjectReference(db, 'bakeday', 'ux')
  await joinProject(db, 'bakeday', {
    id: 'user-mara',
    name: 'Mara',
    email: mara,
  })
  await joinProject(db, 'ux', { id: 'user-fred', name: 'Fred', email: fred })
  await joinProject(db, 'ux', { id: 'user-uma', name: 'Uma', email: uma })
  await addPart(
    db,
    'bakeday',
    {
      type: 'insight',
      title: 'Novices skip the fold',
      source: 'support',
      evidenceLevel: 'hunch',
    },
    mara,
  )
})

afterEach(() => {
  vi.useRealTimers()
})

const asked = {
  id: 1,
  step: 'pick',
  hunch: {
    project: { slug: 'bakeday', name: 'Bakeday' },
    id: 'I1',
    title: 'Novices skip the fold',
    trust: 'solid',
    concept: 'bakeday',
  },
  project: { slug: 'ux', name: 'UX team' },
  pickedBy: null,
  insight: null,
  askedAt: '2026-10-03T12:00:00.000Z',
}

describe('an Ask to another Project', () => {
  it('shows in Mine of each member of the asked Project', async () => {
    const askId = await addAsk(db, 'bakeday', {
      insight: 'I1',
      toProject: 'ux',
    })

    expect(askId).toBe(1)
    expect(await listMineAsks(db, 'ux', fred)).toEqual([asked])
    expect(await listMineAsks(db, 'ux', uma)).toEqual([asked])
    expect(await listMineAsks(db, 'bakeday', mara)).toEqual([])
  })

  it('refuses a Project that the Project may not reference', async () => {
    await addPart(db, 'ux', {
      type: 'insight',
      title: 'Bakers read on the phone',
      source: 'study',
      evidenceLevel: 'hunch',
    })

    await expect(
      addAsk(db, 'ux', { insight: 'I1', toProject: 'bakeday' }),
    ).rejects.toThrow(
      new InvalidRecordError('Project "ux" cannot ask Project "bakeday"'),
    )
  })

  it('refuses an Insight above the level Hunch', async () => {
    await updatePart(db, 'bakeday', 'I1', { evidenceLevel: 'pattern' })

    await expect(
      addAsk(db, 'bakeday', { insight: 'I1', toProject: 'ux' }),
    ).rejects.toThrow(new InvalidRecordError('"I1" is not a Hunch'))
  })

  it('refuses a second Ask of a Hunch with an open Ask', async () => {
    await addAsk(db, 'bakeday', { insight: 'I1', toProject: 'ux' })

    await expect(
      addAsk(db, 'bakeday', { insight: 'I1', toProject: 'ux' }),
    ).rejects.toThrow(new InvalidRecordError('"I1" has an Ask already'))
  })
})

describe('an Ask that a member picks', () => {
  beforeEach(async () => {
    await addAsk(db, 'bakeday', { insight: 'I1', toProject: 'ux' })
    vi.setSystemTime(new Date('2026-10-04T09:00Z'))
  })

  it('shows only in Mine of that member, with the next step', async () => {
    await pickAsk(db, 'ux', 1, fred)

    expect(await listMineAsks(db, 'ux', fred)).toEqual([
      {
        ...asked,
        step: 'hand-back',
        pickedBy: { name: 'Fred', email: fred },
      },
    ])
    expect(await listMineAsks(db, 'ux', uma)).toEqual([])
  })

  it('refuses a second pick', async () => {
    await pickAsk(db, 'ux', 1, fred)

    await expect(pickAsk(db, 'ux', 1, uma)).rejects.toThrow(
      new InvalidRecordError('Fred picked Ask 1 already'),
    )
  })

  it('refuses a person who is no member of the asked Project', async () => {
    await expect(pickAsk(db, 'ux', 1, mara)).rejects.toThrow(
      new InvalidRecordError('mara@example.com is no member of ux.'),
    )
  })

  it('refuses an Ask of another Project', async () => {
    await expect(pickAsk(db, 'bakeday', 1, mara)).rejects.toThrow(
      new InvalidRecordError('Ask 1 not found'),
    )
  })
})

// Fred picked the Ask. The Insight I1 of `ux` is published, I2 is a draft.
describe('an Ask with an Insight that was handed back', () => {
  const study = {
    type: 'insight' as const,
    title: 'Novices do not know the word fold',
    source: 'study',
  }
  const handedBack = {
    ...asked,
    step: 'check',
    pickedBy: { name: 'Fred', email: fred },
    insight: {
      project: { slug: 'ux', name: 'UX team' },
      id: 'I1',
      title: 'Novices do not know the word fold',
      trust: 'solid',
      concept: 'ux',
    },
  }

  beforeEach(async () => {
    await addAsk(db, 'bakeday', { insight: 'I1', toProject: 'ux' })
    await pickAsk(db, 'ux', 1, fred)
    await addPart(db, 'ux', study, fred)
    await addPart(db, 'ux', { ...study, status: 'draft' }, fred)
  })

  it('shows in Mine of the member who asked, and leaves Mine of the member who picked', async () => {
    await handBackAsk(db, 'ux', 1, 'I1')

    expect(await listMineAsks(db, 'bakeday', mara)).toEqual([handedBack])
    expect(await listMineAsks(db, 'ux', fred)).toEqual([])
    expect(await findOpenAsk(db, 'bakeday', 'I1')).toEqual(handedBack)
  })

  it('refuses an Insight that is not published', async () => {
    await expect(handBackAsk(db, 'ux', 1, 'I2')).rejects.toThrow(
      new InvalidRecordError('"I2" is not published'),
    )
  })

  it('refuses an Ask that no member picked', async () => {
    await addPart(db, 'bakeday', {
      type: 'insight',
      title: 'Bakers bake at night',
      source: 'support',
    })
    await addAsk(db, 'bakeday', { insight: 'I2', toProject: 'ux' })

    await expect(handBackAsk(db, 'ux', 2, 'I1')).rejects.toThrow(
      new InvalidRecordError('Ask 2 is not picked yet'),
    )
  })

  it('is done and leaves Mine when the Hunch needs the Insight', async () => {
    await handBackAsk(db, 'ux', 1, 'I1')

    await addJoint(db, 'bakeday', { part: 'I1', needs: 'ux/I1' })

    expect(await listMineAsks(db, 'bakeday', mara)).toEqual([])
    expect(await findOpenAsk(db, 'bakeday', 'I1')).toBeUndefined()
    expect((await findPart(db, 'bakeday', 'I1'))?.needs).toMatchObject([
      { project: { slug: 'ux', name: 'UX team' }, part: { id: 'I1' } },
    ])
  })
})

describe('the Projects that a Project may ask', () => {
  it('are the ones that it may reference', async () => {
    expect(await listAskableProjects(db, 'bakeday')).toEqual([
      { slug: 'ux', name: 'UX team' },
    ])
    expect(await listAskableProjects(db, 'ux')).toEqual([])
  })
})
