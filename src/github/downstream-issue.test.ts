import { beforeEach, describe, expect, it } from 'vitest'

import {
  addConceptRecord,
  setDecisionStatus,
  setProductRepository,
} from '../db/concept-records.ts'
import { findRecord } from '../db/legacy-records.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import { createDownstreamIssue } from './downstream-issue.ts'

const { db } = createTestDatabase(schema)

async function addDecision(status: schema.DecisionStatus) {
  return addConceptRecord(
    db,
    'flexibeck',
    'decisions',
    {
      title: 'Cache every page',
      owner: 'Orchestrator',
      status,
      goal: 'G1',
      evidence: ['I1', 'R1'],
    },
    'Cache all reads at the edge.',
  )
}

beforeEach(async () => {
  await addConceptRecord(
    db,
    'flexibeck',
    'goals',
    { title: 'Ship faster', metric: 'lead time', source: 'okr' },
    '',
  )
  await addConceptRecord(
    db,
    'flexibeck',
    'insights',
    { title: 'Users churn on slow loads', source: 'interviews' },
    '',
  )
  await addConceptRecord(
    db,
    'flexibeck',
    'guardrails',
    { title: 'No query over 200ms', enforced_by: 'monitoring' },
    '',
  )
  await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
})

describe('createDownstreamIssue', () => {
  it('opens one issue for an accepted Decision in the Product repository', async () => {
    const { github, issues } = createFakeGithub()
    await addDecision('proposed')
    const decision = await addDecision('accepted')
    await setDecisionStatus(db, 'flexibeck', 'D1', 'superseded', decision)

    const result = await createDownstreamIssue(
      db,
      github,
      'flexibeck',
      decision,
    )

    expect(result).toEqual({
      kind: 'created',
      url: 'https://github.com/timschoch/flexibeck-next/issues/1',
    })
    expect(issues).toEqual([
      {
        repository: 'timschoch/flexibeck-next',
        issue: {
          title: 'D2: Cache every page',
          body: [
            'Cache all reads at the edge.',
            '',
            'Goal: G1 Ship faster',
            '',
            'Evidence:',
            '- I1 Users churn on slow loads',
            '- R1 No query over 200ms',
            '',
            'Supersedes:',
            '- D1 Cache every page',
            '',
            'Decision: D2',
          ].join('\n'),
          labels: ['ready-for-agent'],
        },
      },
    ])
    const record = await findRecord(db, 'flexibeck', decision)
    expect(record).toMatchObject({
      issueUrl: 'https://github.com/timschoch/flexibeck-next/issues/1',
    })
  })

  it('opens no second issue for a Decision that has one', async () => {
    const { github, issues } = createFakeGithub()
    const decision = await addDecision('accepted')

    await createDownstreamIssue(db, github, 'flexibeck', decision)
    const result = await createDownstreamIssue(
      db,
      github,
      'flexibeck',
      decision,
    )

    expect(result).toEqual({
      kind: 'existing',
      url: 'https://github.com/timschoch/flexibeck-next/issues/1',
    })
    expect(issues).toHaveLength(1)
  })

  it('opens nothing for a Decision that is not accepted', async () => {
    const { github, issues } = createFakeGithub()
    const decision = await addDecision('proposed')

    const result = await createDownstreamIssue(
      db,
      github,
      'flexibeck',
      decision,
    )

    expect(result).toEqual({ kind: 'not-accepted' })
    expect(issues).toEqual([])
  })

  it.each(['G1', 'I1', 'D9'])(
    'opens nothing for %s, which is no Decision of the Product',
    async (recordId) => {
      const { github, issues } = createFakeGithub()

      const result = await createDownstreamIssue(
        db,
        github,
        'flexibeck',
        recordId,
      )

      expect(result).toEqual({ kind: 'not-found' })
      expect(issues).toEqual([])
    },
  )

  it('opens nothing for a Product without a repository', async () => {
    const { github, issues } = createFakeGithub()
    await addConceptRecord(
      db,
      'glue',
      'goals',
      { title: 'Ship faster', metric: 'lead time', source: 'okr' },
      '',
    )
    await addConceptRecord(
      db,
      'glue',
      'insights',
      { title: 'Glue keeps the why', source: 'readme' },
      '',
    )
    const decision = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Keep the why',
        owner: 'Orchestrator',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1'],
      },
      '',
    )

    const result = await createDownstreamIssue(db, github, 'glue', decision)

    expect(result).toEqual({ kind: 'no-repository' })
    expect(issues).toEqual([])
  })

  it('reports a GitHub failure and keeps the Decision accepted without an issue', async () => {
    const decision = await addDecision('accepted')

    const result = await createDownstreamIssue(
      db,
      failingGithub,
      'flexibeck',
      decision,
    )

    expect(result).toEqual({
      kind: 'failed',
      message: 'GitHub answered 503',
    })
    const record = await findRecord(db, 'flexibeck', decision)
    expect(record).toMatchObject({ status: 'accepted', issueUrl: null })
  })

  it('opens the missing issue on a retry after a failure', async () => {
    const { github, issues } = createFakeGithub()
    const decision = await addDecision('accepted')
    await createDownstreamIssue(db, failingGithub, 'flexibeck', decision)

    const result = await createDownstreamIssue(
      db,
      github,
      'flexibeck',
      decision,
    )

    expect(result.kind).toBe('created')
    expect(issues).toHaveLength(1)
  })
})
