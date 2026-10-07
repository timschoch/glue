import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  addPart,
  addProject,
  answerQuestion,
  supersedeDecision,
} from './part-records.ts'
import { findPart, listMine } from './parts.ts'
import { InvalidRecordError } from './record-errors.ts'
import * as schema from './schema.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

// Each test starts with the Goal G1 and the Insight I1.
beforeEach(async () => {
  await client.exec('truncate projects restart identity cascade')
  await addProject(db, 'glue')
  await addPart(db, 'glue', {
    type: 'goal',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'okr',
  })
  await addPart(db, 'glue', {
    type: 'insight',
    title: 'Users churn on slow loads',
    source: 'interview',
    evidenceLevel: 'pattern',
  })
})

afterAll(async () => {
  await client.close()
})

const options = ['Cache the homepage', 'Render on the edge', 'Do nothing']

function addQuestion(status: 'proposed' | 'accepted' = 'proposed') {
  return addPart(db, 'glue', {
    type: 'decision',
    title: 'How do we make the homepage fast?',
    owner: 'Orchestrator',
    status,
    needs: ['G1', 'I1'],
    options,
    pick: 2,
  })
}

describe('a Decision with options', () => {
  it('keeps the options in their order, with the pick of the author', async () => {
    const id = await addQuestion()

    expect(await findPart(db, 'glue', id)).toMatchObject({
      status: 'proposed',
      question: { options, pick: 2, answer: null },
    })
  })

  it('waits in Mine while it is proposed', async () => {
    const id = await addQuestion()

    expect((await listMine(db, 'glue')).map((part) => part.id)).toContain(id)
  })

  it('refuses a pick that is not one of the options', async () => {
    await expect(
      addPart(db, 'glue', {
        type: 'decision',
        title: 'How do we make the homepage fast?',
        owner: 'Orchestrator',
        status: 'proposed',
        needs: ['G1', 'I1'],
        options,
        pick: 4,
      }),
    ).rejects.toThrow(new InvalidRecordError('"pick" 4 is not an option'))
  })

  it('has no question without options', async () => {
    const id = await addPart(db, 'glue', {
      type: 'decision',
      title: 'Cache the homepage',
      owner: 'tim',
      status: 'proposed',
      needs: ['G1', 'I1'],
    })

    expect(await findPart(db, 'glue', id)).toMatchObject({ question: null })
  })
})

describe('answerQuestion', () => {
  it('takes an option: the Decision is accepted and keeps who chose it', async () => {
    const id = await addQuestion()

    await answerQuestion(db, 'glue', id, { option: 3, by: 'Tim' })

    const part = await findPart(db, 'glue', id)
    expect(part).toMatchObject({
      status: 'accepted',
      trust: 'solid',
      workState: 'published',
      question: {
        options,
        pick: 2,
        answer: { option: 3, text: null, by: 'Tim' },
      },
    })
    expect(Date.parse(part?.question?.answer?.at ?? '')).not.toBeNaN()
    expect((await listMine(db, 'glue')).map((mine) => mine.id)).not.toContain(
      id,
    )
  })

  it('takes an answer in words in place of an option', async () => {
    const id = await addQuestion()

    await answerQuestion(db, 'glue', id, { text: 'Buy a CDN', by: 'Tim' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      status: 'accepted',
      question: { answer: { option: null, text: 'Buy a CDN', by: 'Tim' } },
    })
  })

  it('takes an answer in words for a proposed Decision without options', async () => {
    const id = await addPart(db, 'glue', {
      type: 'decision',
      title: 'Which CDN?',
      owner: 'Orchestrator',
      status: 'proposed',
      needs: ['G1', 'I1'],
    })

    await answerQuestion(db, 'glue', id, { text: 'Bunny', by: 'Tim' })

    expect(await findPart(db, 'glue', id)).toMatchObject({
      status: 'accepted',
      question: { options: [], pick: null, answer: { text: 'Bunny' } },
    })
  })

  it('refuses an option that the Decision does not have', async () => {
    const id = await addQuestion()

    await expect(
      answerQuestion(db, 'glue', id, { option: 4, by: 'Tim' }),
    ).rejects.toThrow(new InvalidRecordError(`"${id}" has no option 4`))
    expect(await findPart(db, 'glue', id)).toMatchObject({
      status: 'proposed',
    })
  })

  it('refuses a Decision that is not proposed', async () => {
    const id = await addQuestion('accepted')

    await expect(
      answerQuestion(db, 'glue', id, { option: 1, by: 'Tim' }),
    ).rejects.toThrow(new InvalidRecordError(`"${id}" is not proposed`))
  })

  it('refuses an answer without the name of the person', async () => {
    const id = await addQuestion()

    await expect(answerQuestion(db, 'glue', id, { option: 1 })).rejects.toThrow(
      InvalidRecordError,
    )
  })
})

describe('a superseded Decision', () => {
  it('is unchosen when it was never accepted', async () => {
    const proposed = await addQuestion()
    const successor = await addQuestion('accepted')

    await supersedeDecision(db, 'glue', proposed, successor)

    expect(await findPart(db, 'glue', proposed)).toMatchObject({
      status: 'superseded',
      unchosen: true,
    })
  })

  it('is not unchosen when it was accepted before', async () => {
    const accepted = await addQuestion('accepted')
    const successor = await addQuestion('accepted')

    await supersedeDecision(db, 'glue', accepted, successor)

    expect(await findPart(db, 'glue', accepted)).toMatchObject({
      status: 'superseded',
      unchosen: false,
    })
  })
})
