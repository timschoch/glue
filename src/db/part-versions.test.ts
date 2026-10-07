import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeGithub } from '../test/github.ts'
import { joinProject } from './members.ts'
import { createPartOperations } from './part-operations.ts'
import { addProject } from './part-records.ts'
import type { Activity } from './parts.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const project = 'glue'
const tim = 'tim@example.com'
const ada = 'ada@example.com'

const guardrail = {
  type: 'guardrail' as const,
  title: 'No Tailwind',
  body: 'Carbon only.',
  enforcedBy: 'lint',
}

let operations: ReturnType<typeof createPartOperations>

beforeEach(async () => {
  operations = createPartOperations({ db, github: createFakeGithub().github })
  await addProject(db, project)
  await joinProject(db, project, { id: 'user-tim', name: 'Tim', email: tim })
  await joinProject(db, project, { id: 'user-ada', name: 'Ada', email: ada })
})

describe('the Versions of a Part', () => {
  it('has none for a draft', async () => {
    const { part } = await operations.addPart(project, guardrail, tim)

    expect(part.versions).toEqual([])
  })

  it('gets Version 1 with the text, the fields and the member at the sign-off', async () => {
    await operations.addPart(project, guardrail, tim)

    const { part } = await operations.answerPart(
      project,
      'R1',
      { answer: 'supersede' },
      ada,
    )

    expect(part.versions).toEqual([
      {
        version: 1,
        title: 'No Tailwind',
        body: 'Carbon only.',
        status: null,
        owner: null,
        date: null,
        source: null,
        metric: null,
        enforcedBy: 'lint',
        evidenceLevel: null,
        signedAt: expect.any(String),
        signedBy: 'Ada',
      },
    ])
  })

  it('gets Version 1 when it is published from the start', async () => {
    const { part } = await operations.addPart(project, insight, tim)

    expect(part.versions).toMatchObject([
      { version: 1, title: 'Loads are slow', signedBy: 'Tim' },
    ])
  })

  it('keeps the old Version when a new sign-off adds the next one', async () => {
    await signOffTwice()

    const part = await operations.getPart(project, 'R1')

    expect(part.title).toBe('No utility classes')
    expect(part.versions).toMatchObject([
      { version: 2, title: 'No utility classes', signedBy: 'Ada' },
      { version: 1, title: 'No Tailwind', signedBy: 'Ada' },
    ])
  })

  it('gets no Version from a wording fix', async () => {
    await operations.addPart(project, insight, tim)

    const { part } = await operations.updatePart(
      project,
      'I1',
      { title: 'Loads are too slow', sameMeaning: true },
      undefined,
      ada,
    )

    expect(part.versions).toMatchObject([
      { version: 1, title: 'Loads are slow' },
    ])
  })

  it('gets no Version from the answer that a flagged Part is fine', async () => {
    await addAcceptedDecision()
    await operations.updatePart(project, 'I1', { title: 'Loads are fast' })

    const { part } = await operations.answerPart(
      project,
      'D1',
      { answer: 'fine' },
      tim,
    )

    expect(part.workState).toBe('published')
    expect(part.versions).toMatchObject([{ version: 1 }])
  })
})

describe('the activity of a Part', () => {
  it('has a line for each step and each edit, with the member', async () => {
    await signOffTwice()

    const part = await operations.getPart(project, 'R1')

    expect(part.activity.map(toLine)).toEqual([
      'published by Ada, Version 2',
      'review by Tim',
      'changed by Tim',
      'draft by Tim',
      'published by Ada, Version 1',
      'draft by Tim',
    ])
  })

  it('has a line for a wording fix', async () => {
    await operations.addPart(project, insight, tim)

    const { part } = await operations.updatePart(
      project,
      'I1',
      { title: 'Loads are too slow', sameMeaning: true },
      undefined,
      ada,
    )

    expect(part.activity.map(toLine)).toEqual([
      'wording by Ada',
      'published by Tim, Version 1',
    ])
  })

  it('has a line with no member for a Part that a flag turns to-check', async () => {
    await addAcceptedDecision()

    await operations.updatePart(
      project,
      'I1',
      { title: 'Loads are fast' },
      undefined,
      ada,
    )

    const part = await operations.getPart(project, 'D1')
    expect(part.activity.map(toLine)).toEqual([
      'to-check',
      'flag-opened',
      'published by Tim, Version 1',
    ])
  })

  it('has a line for the member who answers the question of a Decision', async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, insight)
    await operations.addPart(
      project,
      { ...decision, status: 'proposed', options: ['Cache', 'No cache'] },
      tim,
    )

    const { part } = await operations.answerQuestion(
      project,
      'D1',
      { option: 1, by: 'Ada' },
      ada,
    )

    expect(part.activity.map(toLine)).toEqual([
      'published by Ada, Version 1',
      'review by Tim',
    ])
  })
})

const insight = {
  type: 'insight' as const,
  title: 'Loads are slow',
  source: 'interview',
  date: '2026-10-01',
}

const goal = {
  type: 'goal' as const,
  title: 'Ship faster',
  metric: 'lead time',
  source: 'okr',
}

const decision = {
  type: 'decision' as const,
  title: 'Cache the homepage',
  date: '2026-10-02',
  owner: 'tim',
  needs: ['G1', 'I1'],
}

// One line of the activity, without its time.
function toLine({ kind, ...line }: Activity) {
  const by = 'by' in line && line.by ? ` by ${line.by}` : ''
  const version =
    'version' in line && line.version ? `, Version ${line.version}` : ''
  return `${kind}${by}${version}`
}

// D1 is accepted, and it needs the Insight I1.
async function addAcceptedDecision() {
  await operations.addPart(project, goal)
  await operations.addPart(project, insight)
  await operations.addPart(project, { ...decision, status: 'accepted' }, tim)
}

// Ada signs the Guardrail R1 off, Tim takes it back and changes it, and Ada
// signs it off again.
async function signOffTwice() {
  await operations.addPart(project, guardrail, tim)
  await operations.answerPart(project, 'R1', { answer: 'supersede' }, ada)
  await operations.answerPart(project, 'R1', { answer: 'not-ready' }, tim)
  await operations.updatePart(
    project,
    'R1',
    { title: 'No utility classes' },
    undefined,
    tim,
  )
  await operations.answerPart(project, 'R1', { answer: 'ready' }, tim)
  await operations.answerPart(project, 'R1', { answer: 'supersede' }, ada)
}
