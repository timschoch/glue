import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addAsk,
  findOpenAsk,
  handBackAsk,
  listAskableProjects,
  listMineAsks,
  pickAsk,
  takeBackAsk,
} from './asks.ts'
import { joinProject } from './members.ts'
import {
  addJoint,
  addPart,
  addProject,
  answerPart,
  updatePart,
} from './part-records.ts'
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
  kind: 'insight',
  step: 'pick',
  part: {
    project: { slug: 'bakeday', name: 'Bakeday' },
    id: 'I1',
    type: 'insight',
    title: 'Novices skip the fold',
    trust: 'solid',
    concept: 'bakeday',
  },
  project: { slug: 'ux', name: 'UX team' },
  question: null,
  askedBy: null,
  pickedBy: null,
  handedBack: null,
  askedAt: '2026-10-03T12:00:00.000Z',
}

describe('an Ask to another Project', () => {
  it('shows in Mine of each member of the asked Project', async () => {
    const askId = await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' })

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
      addAsk(db, 'ux', { part: 'I1', toProject: 'bakeday' }),
    ).rejects.toThrow(
      new InvalidRecordError('Project "ux" cannot ask Project "bakeday"'),
    )
  })

  it('refuses an Insight above the level Hunch', async () => {
    await updatePart(db, 'bakeday', 'I1', { evidenceLevel: 'pattern' })

    await expect(
      addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' }),
    ).rejects.toThrow(new InvalidRecordError('"I1" is not a Hunch'))
  })

  it('refuses a second Ask of a Hunch with an open Ask', async () => {
    await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' })

    await expect(
      addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' }),
    ).rejects.toThrow(new InvalidRecordError('"I1" has an Ask already'))
  })
})

describe('an Ask that a member picks', () => {
  beforeEach(async () => {
    await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' })
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
    handedBack: {
      project: { slug: 'ux', name: 'UX team' },
      id: 'I1',
      type: 'insight',
      title: 'Novices do not know the word fold',
      trust: 'solid',
      concept: 'ux',
    },
  }

  beforeEach(async () => {
    await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' })
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

  it('refuses a Part that is no Insight', async () => {
    await addPart(db, 'ux', { type: 'entity', title: 'Fold' })

    await expect(handBackAsk(db, 'ux', 1, 'E1')).rejects.toThrow(
      new InvalidRecordError('"E1" is not an Insight'),
    )
  })

  it('refuses an Ask that no member picked', async () => {
    await addPart(db, 'bakeday', {
      type: 'insight',
      title: 'Bakers bake at night',
      source: 'support',
    })
    await addAsk(db, 'bakeday', { part: 'I2', toProject: 'ux' })

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

describe('an Ask that the Project takes back', () => {
  beforeEach(async () => {
    await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' })
  })

  it('leaves Mine of the asked Project, and the Hunch can ask again', async () => {
    await takeBackAsk(db, 'bakeday', 1, mara)

    expect(await listMineAsks(db, 'ux', fred)).toEqual([])
    expect(await findOpenAsk(db, 'bakeday', 'I1')).toBeUndefined()
    expect(await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' })).toBe(2)
  })

  it('stays when a member picked it', async () => {
    await pickAsk(db, 'ux', 1, fred)

    await expect(takeBackAsk(db, 'bakeday', 1, mara)).rejects.toThrow(
      new InvalidRecordError('Fred picked Ask 1 already'),
    )
    expect(await listMineAsks(db, 'ux', fred)).toMatchObject([{ id: 1 }])
  })

  it('stays when another Project takes it back', async () => {
    await expect(takeBackAsk(db, 'ux', 1, fred)).rejects.toThrow(
      new InvalidRecordError('Ask 1 not found'),
    )
    expect(await listMineAsks(db, 'ux', fred)).toMatchObject([{ id: 1 }])
  })

  it('stays when a member who does not have the Hunch takes it back', async () => {
    await joinProject(db, 'bakeday', {
      id: 'user-ben',
      name: 'Ben',
      email: 'ben@example.com',
    })

    await expect(
      takeBackAsk(db, 'bakeday', 1, 'ben@example.com'),
    ).rejects.toThrow(
      new InvalidRecordError(
        'ben@example.com does not have the Hunch of Ask 1',
      ),
    )
    expect(await listMineAsks(db, 'ux', fred)).toMatchObject([{ id: 1 }])
  })

  it('stays when a person who is no member of the Project takes it back', async () => {
    await expect(takeBackAsk(db, 'bakeday', 1, fred)).rejects.toThrow(
      new InvalidRecordError('fred@example.com is no member of bakeday.'),
    )
    expect(await listMineAsks(db, 'ux', fred)).toMatchObject([{ id: 1 }])
  })

  it('goes when nobody has the Hunch and a member takes it back', async () => {
    await addPart(db, 'bakeday', {
      type: 'insight',
      title: 'Experts skip the tour',
      source: 'support',
      evidenceLevel: 'hunch',
    })
    await addAsk(db, 'bakeday', { part: 'I2', toProject: 'ux' })

    await takeBackAsk(db, 'bakeday', 2, mara)

    expect(await findOpenAsk(db, 'bakeday', 'I2')).toBeUndefined()
  })
})

// Ben is a member of `bakeday` too. He made the Ask of the Hunch of Mara.
describe('an Ask with the member who made it', () => {
  const ben = 'ben@example.com'

  beforeEach(async () => {
    await joinProject(db, 'bakeday', {
      id: 'user-ben',
      name: 'Ben',
      email: ben,
    })
    await addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' }, ben)
  })

  it('names that member', async () => {
    expect(await findOpenAsk(db, 'bakeday', 'I1')).toEqual({
      ...asked,
      askedBy: { name: 'Ben', email: ben },
    })
  })

  it('goes when that member takes it back', async () => {
    await takeBackAsk(db, 'bakeday', 1, ben)

    expect(await findOpenAsk(db, 'bakeday', 'I1')).toBeUndefined()
  })

  it('stays when another member takes it back, also the one who has the Part', async () => {
    await expect(takeBackAsk(db, 'bakeday', 1, mara)).rejects.toThrow(
      new InvalidRecordError('mara@example.com did not make Ask 1'),
    )
    expect(await listMineAsks(db, 'ux', fred)).toMatchObject([{ id: 1 }])
  })

  it('refuses a person who is no member of the Project as the one who asks', async () => {
    await takeBackAsk(db, 'bakeday', 1, ben)

    await expect(
      addAsk(db, 'bakeday', { part: 'I1', toProject: 'ux' }, fred),
    ).rejects.toThrow(
      new InvalidRecordError('fred@example.com is no member of bakeday.'),
    )
  })
})

// The Goal G1 of `bakeday` waits for a Decision of `ux`. The Decision D1 of
// `ux` is accepted, D2 is proposed.
describe('an Ask for a Decision', () => {
  const question = 'Which fold do we teach first?'
  const forDecision = {
    kind: 'decision' as const,
    part: 'G1',
    toProject: 'ux',
    question,
  }
  const decision = {
    type: 'decision' as const,
    title: 'Teach the letter fold first',
    owner: 'Fred',
    date: '2026-10-02',
    needs: ['G1', 'I1'],
  }

  beforeEach(async () => {
    await addPart(
      db,
      'bakeday',
      {
        type: 'goal',
        title: 'Novices finish a loaf',
        metric: 'finished loaves',
        source: 'okr',
      },
      mara,
    )
    await addPart(db, 'ux', {
      type: 'goal',
      title: 'Each study ends with a Decision',
      metric: 'studies with a Decision',
      source: 'okr',
    })
    await addPart(db, 'ux', {
      type: 'insight',
      title: 'Novices do not know the word fold',
      source: 'study',
    })
    await addPart(db, 'ux', { ...decision, status: 'accepted' })
    await addPart(db, 'ux', { ...decision, status: 'proposed' })
  })

  it('shows in Mine of the asked Project, with its question and the member who asked', async () => {
    const askId = await addAsk(db, 'bakeday', forDecision, mara)

    expect(askId).toBe(1)
    expect(await listMineAsks(db, 'ux', fred)).toEqual([
      {
        id: 1,
        kind: 'decision',
        step: 'pick',
        part: {
          project: { slug: 'bakeday', name: 'Bakeday' },
          id: 'G1',
          type: 'goal',
          title: 'Novices finish a loaf',
          // A Goal with no Decision.
          trust: 'not-ready',
          concept: 'bakeday',
        },
        project: { slug: 'ux', name: 'UX team' },
        question: 'Which fold do we teach first?',
        askedBy: { name: 'Mara', email: mara },
        pickedBy: null,
        handedBack: null,
        askedAt: '2026-10-03T12:00:00.000Z',
      },
    ])
  })

  it('refuses an Ask without a question', async () => {
    await expect(
      addAsk(db, 'bakeday', { ...forDecision, question: undefined }),
    ).rejects.toThrow(
      new InvalidRecordError('an Ask for a Decision needs a question'),
    )
  })

  it('refuses a Part that is sunk', async () => {
    await answerPart(db, 'bakeday', 'G1', { answer: 'sink' })

    await expect(addAsk(db, 'bakeday', forDecision)).rejects.toThrow(
      new InvalidRecordError('"G1" is sunk'),
    )
  })

  it('is done when a Decision is handed back: the Part that waits needs it', async () => {
    await addAsk(db, 'bakeday', forDecision, mara)
    await pickAsk(db, 'ux', 1, fred)

    await handBackAsk(db, 'ux', 1, 'D1')

    expect((await findPart(db, 'bakeday', 'G1'))?.needs).toMatchObject([
      {
        project: { slug: 'ux', name: 'UX team' },
        part: { id: 'D1', title: 'Teach the letter fold first' },
      },
    ])
    expect(await findOpenAsk(db, 'bakeday', 'G1')).toBeUndefined()
    expect(await listMineAsks(db, 'bakeday', mara)).toEqual([])
    expect(await listMineAsks(db, 'ux', fred)).toEqual([])
  })

  it('refuses a Decision that is not published', async () => {
    await addAsk(db, 'bakeday', forDecision, mara)
    await pickAsk(db, 'ux', 1, fred)

    await expect(handBackAsk(db, 'ux', 1, 'D2')).rejects.toThrow(
      new InvalidRecordError('"D2" is not published'),
    )
    expect((await findPart(db, 'bakeday', 'G1'))?.needs).toEqual([])
  })

  it('refuses a Part that is no Decision', async () => {
    await addAsk(db, 'bakeday', forDecision, mara)
    await pickAsk(db, 'ux', 1, fred)

    await expect(handBackAsk(db, 'ux', 1, 'I1')).rejects.toThrow(
      new InvalidRecordError('"I1" is not a Decision'),
    )
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
