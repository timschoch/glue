import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  answerContractQuestion,
  askContractQuestion,
  listContractQuestions,
  listMineContractQuestions,
} from './contract-questions.ts'
import { findContract, signContract } from './contracts.ts'
import { assign, joinProject } from './members.ts'
import { addConcept, addPart, addProject } from './part-records.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const mara = 'mara@example.com'
const fred = 'fred@example.com'
const uma = 'uma@example.com'

// A Part that is solid, so the Concept can take a sign-off.
async function addInsight(title: string) {
  await addPart(db, 'bakeday', {
    type: 'insight',
    concept: 'videos',
    title,
    source: 'interview',
  })
}

// Project `bakeday` has the Concept `videos` with Contract Version 1. Mara,
// Fred and Uma are its members.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
  await addProject(db, 'bakeday', 'Bakeday')
  await addConcept(db, 'bakeday', { slug: 'videos', title: 'Technique videos' })
  await joinProject(db, 'bakeday', {
    id: 'user-mara',
    name: 'Mara',
    email: mara,
  })
  await joinProject(db, 'bakeday', {
    id: 'user-fred',
    name: 'Fred',
    email: fred,
  })
  await joinProject(db, 'bakeday', { id: 'user-uma', name: 'Uma', email: uma })
  await addInsight('Technique')
  await signContract(db, 'bakeday', 'videos', 'Mara')
})

afterEach(() => {
  vi.useRealTimers()
})

const asked = {
  id: 1,
  concept: 'videos',
  conceptTitle: 'Technique videos',
  version: 1,
  stale: false,
  text: 'Does a Technique need a video?',
  askedBy: 'build-agent',
  askedAt: '2026-10-03T12:00:00.000Z',
  answer: null,
}

function ask(version?: number) {
  return askContractQuestion(db, 'bakeday', 'videos', {
    text: 'Does a Technique need a video?',
    askedBy: 'build-agent',
    version,
  })
}

describe('a question about a Contract Version', () => {
  it('names the newest Version when the builder names none', async () => {
    expect(await ask()).toEqual(asked)
    expect(await listContractQuestions(db, 'bakeday', 'videos')).toEqual([
      asked,
    ])
  })

  it('is stale when the Concept has a newer Version', async () => {
    await addInsight('Demo')
    await signContract(db, 'bakeday', 'videos', 'Mara')

    expect(await ask(1)).toEqual({ ...asked, stale: true })
    expect(await ask()).toEqual({ ...asked, id: 2, version: 2 })
  })

  it('refuses a Version that the Concept does not have', async () => {
    await expect(ask(7)).rejects.toThrow(
      new InvalidRecordError('"videos" has no Contract Version 7'),
    )
  })

  it('refuses a Concept with no Contract Version', async () => {
    await addConcept(db, 'bakeday', { slug: 'player', title: 'Player' })

    await expect(
      askContractQuestion(db, 'bakeday', 'player', {
        text: 'What plays?',
        askedBy: 'build-agent',
      }),
    ).rejects.toThrow(
      new InvalidRecordError('"player" has no Contract Version'),
    )
  })
})

describe('the questions of a Concept', () => {
  it('lists the newest question first', async () => {
    await ask()
    vi.setSystemTime(new Date('2026-10-04T09:00Z'))
    await askContractQuestion(db, 'bakeday', 'videos', {
      text: 'Which length has a video?',
      askedBy: 'Fred',
    })

    const listed = await listContractQuestions(db, 'bakeday', 'videos')

    expect(listed.map(({ id, askedAt }) => ({ id, askedAt }))).toEqual([
      { id: 2, askedAt: '2026-10-04T09:00:00.000Z' },
      { id: 1, askedAt: '2026-10-03T12:00:00.000Z' },
    ])
  })
})

describe('the answer to a question', () => {
  beforeEach(async () => {
    await ask()
    vi.setSystemTime(new Date('2026-10-04T09:00Z'))
  })

  it('stores who gave it and when', async () => {
    const answered = {
      ...asked,
      answer: {
        text: 'Yes, each one.',
        by: 'Mara',
        at: '2026-10-04T09:00:00.000Z',
      },
    }

    expect(
      await answerContractQuestion(db, 'bakeday', 1, {
        text: 'Yes, each one.',
        answeredBy: 'Mara',
      }),
    ).toEqual(answered)
    expect(await listContractQuestions(db, 'bakeday', 'videos')).toEqual([
      answered,
    ])
  })

  it('refuses a second answer', async () => {
    await answerContractQuestion(db, 'bakeday', 1, {
      text: 'Yes, each one.',
      answeredBy: 'Mara',
    })

    await expect(
      answerContractQuestion(db, 'bakeday', 1, {
        text: 'No.',
        answeredBy: 'Fred',
      }),
    ).rejects.toThrow(new InvalidRecordError('Question 1 has an answer'))
  })

  it('refuses a question that the Project does not have', async () => {
    await expect(
      answerContractQuestion(db, 'bakeday', 9, {
        text: 'No.',
        answeredBy: 'Fred',
      }),
    ).rejects.toThrow(new InvalidRecordError('Question 9 not found'))
  })

  it('goes into the Contract that a builder reads', async () => {
    await askContractQuestion(db, 'bakeday', 'videos', {
      text: 'Which length has a video?',
      askedBy: 'Fred',
    })
    await answerContractQuestion(db, 'bakeday', 1, {
      text: 'Yes, each one.',
      answeredBy: 'Mara',
    })

    const contract = await findContract(db, 'bakeday', 'videos')

    expect(contract?.questions).toEqual([
      {
        ...asked,
        answer: {
          text: 'Yes, each one.',
          by: 'Mara',
          at: '2026-10-04T09:00:00.000Z',
        },
      },
    ])
  })
})

describe('an open question in Mine', () => {
  beforeEach(async () => {
    await ask()
  })

  it('shows for the Responsible of the Concept only', async () => {
    await assign(db, 'bakeday', {
      member: mara,
      concept: 'videos',
      role: 'responsible',
    })
    await assign(db, 'bakeday', {
      member: fred,
      concept: 'videos',
      role: 'co-author',
    })

    expect(await listMineContractQuestions(db, 'bakeday', mara)).toEqual([
      asked,
    ])
    expect(await listMineContractQuestions(db, 'bakeday', fred)).toEqual([])
    expect(await listMineContractQuestions(db, 'bakeday', uma)).toEqual([])
  })

  it('shows for each Co-Author when the Concept has no Responsible', async () => {
    await assign(db, 'bakeday', {
      member: fred,
      concept: 'videos',
      role: 'co-author',
    })
    await assign(db, 'bakeday', {
      member: uma,
      concept: 'videos',
      role: 'co-author',
    })

    expect(await listMineContractQuestions(db, 'bakeday', fred)).toEqual([
      asked,
    ])
    expect(await listMineContractQuestions(db, 'bakeday', uma)).toEqual([asked])
    expect(await listMineContractQuestions(db, 'bakeday', mara)).toEqual([])
  })

  it('goes away with its answer', async () => {
    await assign(db, 'bakeday', {
      member: mara,
      concept: 'videos',
      role: 'responsible',
    })
    await answerContractQuestion(db, 'bakeday', 1, {
      text: 'Yes, each one.',
      answeredBy: 'Mara',
    })

    expect(await listMineContractQuestions(db, 'bakeday', mara)).toEqual([])
  })

  it('shows each open question of the Project without a member', async () => {
    expect(await listMineContractQuestions(db, 'bakeday')).toEqual([asked])
  })
})
