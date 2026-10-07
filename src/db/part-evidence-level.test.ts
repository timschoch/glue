import { beforeEach, describe, expect, it } from 'vitest'

import { createFakeGithub } from '../test/github.ts'
import { joinProject } from './members.ts'
import { createPartOperations } from './part-operations.ts'
import { addProject } from './part-records.ts'
import { setProductRepository } from './projects.ts'
import * as schema from './schema.ts'
import { createTestDatabase } from './test-database.ts'

const { db } = createTestDatabase(schema)

const project = 'glue'
const tim = 'tim@example.com'
const ada = 'ada@example.com'

let operations: ReturnType<typeof createPartOperations>

beforeEach(async () => {
  operations = createPartOperations({ db, github: createFakeGithub().github })
  await addProject(db, project)
  await joinProject(db, project, { id: 'user-tim', name: 'Tim', email: tim })
  await joinProject(db, project, { id: 'user-ada', name: 'Ada', email: ada })
})

describe('the step Raise', () => {
  it('takes a Hunch to Pattern when its Signals agree', async () => {
    operations = createPartOperations({
      db,
      github: createFakeGithub(issues).github,
    })
    await setProductRepository(db, project, 'timschoch/glue')
    await operations.addSignalInsight(project, {
      signals: issues.map(({ url }) => url),
    })

    const { part } = await operations.answerPart(
      project,
      'I1',
      { answer: 'raise' },
      ada,
    )

    expect(part.evidenceLevel).toBe('pattern')
    expect(part.activity[0]).toMatchObject({ kind: 'raised', by: 'Ada' })
    expect(part.activity[0]).not.toHaveProperty('note')
  })

  it('refuses a Hunch whose Signals do not agree', async () => {
    await operations.addPart(project, insight)

    await expect(
      operations.answerPart(project, 'I1', { answer: 'raise' }, ada),
    ).rejects.toThrow(
      'the Signals of "I1" do not agree: name the second source that agrees',
    )
    expect((await operations.getPart(project, 'I1')).evidenceLevel).toBeNull()
  })

  it('takes such a Hunch with the second source that agrees and keeps it', async () => {
    await operations.addPart(project, insight)

    const { part } = await operations.answerPart(
      project,
      'I1',
      { answer: 'raise', source: 'Bo said the same in the review' },
      ada,
    )

    expect(part.evidenceLevel).toBe('pattern')
    expect(part.activity[0]).toMatchObject({
      kind: 'raised',
      by: 'Ada',
      note: 'Bo said the same in the review',
    })
  })

  it('refuses a Pattern', async () => {
    await operations.addPart(project, { ...insight, evidenceLevel: 'pattern' })

    await expect(
      operations.answerPart(
        project,
        'I1',
        { answer: 'raise', source: 'Bo said the same' },
        ada,
      ),
    ).rejects.toThrow('"I1" is not a Hunch')
  })
})

describe('the step Verify', () => {
  it('takes a Pattern to Confirmed and keeps what was tested', async () => {
    await operations.addPart(project, { ...insight, evidenceLevel: 'pattern' })

    const { part } = await operations.answerPart(
      project,
      'I1',
      { answer: 'verify', tested: 'Five users, each one waited' },
      ada,
    )

    expect(part.evidenceLevel).toBe('confirmed')
    expect(part.activity[0]).toMatchObject({
      kind: 'verified',
      by: 'Ada',
      note: 'Five users, each one waited',
    })
  })

  it('refuses a Hunch', async () => {
    await operations.addPart(project, insight)

    await expect(
      operations.answerPart(
        project,
        'I1',
        { answer: 'verify', tested: 'Five users' },
        ada,
      ),
    ).rejects.toThrow('"I1" is not a published Pattern')
  })
})

describe('the step Dispute', () => {
  it('takes a Confirmed Insight back to Pattern and keeps the reason', async () => {
    await operations.addPart(project, {
      ...insight,
      evidenceLevel: 'confirmed',
    })

    const { part } = await operations.answerPart(
      project,
      'I1',
      { answer: 'dispute', reason: 'The test had one user' },
      ada,
    )

    expect(part.evidenceLevel).toBe('pattern')
    expect(part.activity[0]).toMatchObject({
      kind: 'disputed',
      by: 'Ada',
      note: 'The test had one user',
    })
  })

  it('flags each Part that needs the Insight', async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, {
      ...insight,
      evidenceLevel: 'confirmed',
    })
    await operations.addPart(project, { ...decision, status: 'accepted' })

    await operations.answerPart(
      project,
      'I1',
      { answer: 'dispute', reason: 'The test had one user' },
      ada,
    )

    const needing = await operations.getPart(project, 'D1')
    expect(needing.workState).toBe('to-check')
    expect(needing.flags).toMatchObject([
      { cause: { id: 'I1' }, reason: 'changed' },
    ])
  })

  it('refuses a Pattern', async () => {
    await operations.addPart(project, { ...insight, evidenceLevel: 'pattern' })

    await expect(
      operations.answerPart(
        project,
        'I1',
        { answer: 'dispute', reason: 'One user' },
        ada,
      ),
    ).rejects.toThrow('"I1" is not a published Confirmed Insight')
  })
})

describe('the sign-off of a Decision', () => {
  it('refuses a Decision when each piece of its evidence is a Hunch', async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, insight)
    const { part } = await operations.addPart(project, proposed)

    expect(part.evidenceBase).toBe('hunch')
    expect(part.answers).not.toContain('supersede')
    await expect(
      operations.answerPart(project, 'D1', { answer: 'supersede' }, tim),
    ).rejects.toThrow('"D1" rests on a Hunch')
  })

  it('refuses the answer to the question of such a Decision', async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, insight)
    await operations.addPart(project, proposed)

    await expect(
      operations.answerQuestion(project, 'D1', { text: 'Yes', by: 'Tim' }, tim),
    ).rejects.toThrow('"D1" rests on a Hunch')
  })

  it('takes a Decision that rests on a Pattern', async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, insight)
    await operations.addPart(project, { ...insight, evidenceLevel: 'pattern' })
    await operations.addPart(project, {
      ...proposed,
      needs: ['G1', 'I1', 'I2'],
    })

    const { part } = await operations.answerPart(
      project,
      'D1',
      { answer: 'supersede' },
      tim,
    )

    expect(part.workState).toBe('published')
    expect(part.evidenceBase).toBe('pattern')
  })

  it('counts a Guardrail as Confirmed', async () => {
    await operations.addPart(project, goal)
    await operations.addPart(project, guardrail)
    const { part } = await operations.addPart(project, {
      ...proposed,
      needs: ['G1', 'R1'],
    })

    expect(part.evidenceBase).toBe('confirmed')
    expect(part.answers).toContain('supersede')
  })

  it('has no base for a Part that is no Decision', async () => {
    const { part } = await operations.addPart(project, insight)

    expect(part.evidenceBase).toBeNull()
  })
})

// Three issues of one source on three days, eight days apart: they agree.
const issues = [1, 5, 9].map((day) => ({
  url: `https://github.com/timschoch/glue/issues/${day}`,
  title: 'Loads are slow',
  body: '',
  createdAt: `2026-10-0${day}T08:00:00Z`,
}))

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

const guardrail = {
  type: 'guardrail' as const,
  title: 'No Tailwind',
  body: 'Carbon only.',
  enforcedBy: 'lint',
}

const decision = {
  type: 'decision' as const,
  title: 'Cache the homepage',
  date: '2026-10-02',
  owner: 'tim',
  needs: ['G1', 'I1'],
}

const proposed = { ...decision, status: 'proposed' as const }
