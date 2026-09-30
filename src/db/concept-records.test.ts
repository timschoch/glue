import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  acceptDecision,
  addConceptRecord,
  addDecision,
  discardInsight,
  keepInsight,
  listConceptRecords,
  ProductNotFoundError,
  setDecisionStatus,
  setProductRepository,
  showConceptRecord,
  updateDecision,
} from './concept-records.ts'
import * as schema from './schema.ts'
import type { GithubClient, IssueInput } from '../github/client.ts'
import { createDownstreamIssue } from '../github/downstream-issue.ts'
import { createFakeGithub } from '../test/github.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let github: GithubClient
let issues: { repository: string; issue: IssueInput }[]

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  ;({ github, issues } = createFakeGithub())
  await addConceptRecord(
    db,
    'glue',
    'goals',
    {
      title: 'Ship faster',
      metric: 'lead time',
      source: 'https://example.com/g1',
    },
    '',
  )
  await addConceptRecord(
    db,
    'glue',
    'insights',
    {
      title: 'Users churn on slow loads',
      date: '2026-01-01',
      source: 'https://example.com/i1',
    },
    '',
  )
  await addConceptRecord(
    db,
    'glue',
    'facts',
    { title: 'p95 load time is 3s', source: 'https://example.com/f1' },
    '',
  )
  await addConceptRecord(
    db,
    'glue',
    'decisions',
    {
      title: 'Cache the homepage',
      date: '2026-01-02',
      owner: 'tim',
      status: 'accepted',
      goal: 'G1',
      evidence: ['I1', 'F1'],
    },
    'Cache reads at the edge.',
  )
})

afterEach(async () => {
  await client.close()
})

describe('listConceptRecords', () => {
  it('lists one row per record with id, status and title', async () => {
    const rows = await listConceptRecords(db, 'glue', 'decisions')
    expect(rows).toEqual([
      { id: 'D1', status: 'accepted', title: 'Cache the homepage' },
    ])
  })

  it('lists every folder when none is given', async () => {
    const rows = await listConceptRecords(db, 'glue')
    expect(rows.map((row) => row.id).sort()).toEqual(['D1', 'F1', 'G1', 'I1'])
  })

  it('sorts by the number in the id, so D2 comes before D10', async () => {
    // D1 exists already. Eight more Decisions bring D2 to D9, then D10, D11.
    for (let added = 0; added < 10; added++)
      await addConceptRecord(
        db,
        'glue',
        'decisions',
        {
          title: 'Cache the homepage',
          date: '2026-01-02',
          owner: 'tim',
          status: 'accepted',
          goal: 'G1',
          evidence: ['I1'],
        },
        '',
      )

    const rows = await listConceptRecords(db, 'glue', 'decisions')

    expect(rows.map((row) => row.id)).toEqual([
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'D8',
      'D9',
      'D10',
      'D11',
    ])
  })
})

describe('showConceptRecord', () => {
  it('shows a Decision with its Goal and evidence titles', async () => {
    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.title).toBe('Cache the homepage')
    expect(record.body).toBe('Cache reads at the edge.')
    expect(record.goal).toEqual({ id: 'G1', title: 'Ship faster' })
    expect(record.evidence).toEqual(
      expect.arrayContaining([
        { id: 'I1', title: 'Users churn on slow loads' },
        { id: 'F1', title: 'p95 load time is 3s' },
      ]),
    )
  })

  it('shows the issue of a Decision once it has one', async () => {
    await setProductRepository(db, 'glue', 'timschoch/glue')
    expect((await showConceptRecord(db, 'glue', 'D1')).fields.issue).toBe(
      undefined,
    )

    await createDownstreamIssue(db, createFakeGithub().github, 'glue', 'D1')

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.issue).toBe(
      'https://github.com/timschoch/glue/issues/1',
    )
  })

  it('shows a non-Decision record', async () => {
    const record = await showConceptRecord(db, 'glue', 'G1')
    expect(record.fields.title).toBe('Ship faster')
    expect(record.goal).toBeUndefined()
  })

  it('throws when the id does not exist', async () => {
    await expect(showConceptRecord(db, 'glue', 'D9')).rejects.toThrow(
      /"D9" not found/,
    )
  })
})

describe('setProductRepository', () => {
  it('rejects a repository that is not owner/name', async () => {
    await expect(
      setProductRepository(db, 'glue', 'https://github.com/timschoch/glue'),
    ).rejects.toThrow(/must look like owner\/name/)
  })

  it('throws for a Product that does not exist', async () => {
    await expect(
      setProductRepository(db, 'nope', 'timschoch/glue'),
    ).rejects.toThrow(/product "nope" not found/)
  })
})

describe('addConceptRecord', () => {
  it('defaults date to today (UTC) for an Insight without one', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'insights',
      {
        title: 'Users bounce on the pricing page',
        source: 'https://example.com/i2',
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.fields.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps a given date for an Insight instead of defaulting', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'insights',
      {
        title: 'Users bounce on the pricing page',
        source: 'https://example.com/i2',
        date: '2020-01-01',
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.fields.date).toBe('2020-01-01')
  })

  it('inserts with the next free id and returns it', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'guardrails',
      { title: 'No query over 200ms', enforced_by: 'none yet' },
      '',
    )
    expect(id).toBe('R1')

    const secondId = await addConceptRecord(
      db,
      'glue',
      'guardrails',
      { title: 'No secret in logs', enforced_by: 'none yet' },
      '',
    )
    expect(secondId).toBe('R2')
  })

  it('rejects a missing required field and writes nothing', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'guardrails',
        { title: 'No title check' },
        '',
      ),
    ).rejects.toThrow(/"enforced_by" is required/)

    const rows = await listConceptRecords(db, 'glue', 'guardrails')
    expect(rows).toHaveLength(0)
  })

  it('rejects a Decision whose goal does not exist and writes nothing', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        {
          title: 'Bad decision',
          date: '2026-01-03',
          owner: 'tim',
          status: 'accepted',
          goal: 'G9',
          evidence: ['I1'],
        },
        '',
      ),
    ).rejects.toThrow(/goal "G9" not found/)

    const rows = await listConceptRecords(db, 'glue', 'decisions')
    expect(rows).toHaveLength(1)
  })

  it('keeps one link when a Decision cites the same Insight twice', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Double citation',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1', 'I1'],
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.evidence).toEqual([
      { id: 'I1', title: 'Users churn on slow loads' },
    ])
  })

  it('keeps one link when a Decision cites the same Fact twice', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Double citation',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['F1', 'F1'],
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.evidence).toEqual([
      { id: 'F1', title: 'p95 load time is 3s' },
    ])
  })

  it('rejects a superseded Decision without superseded_by', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        {
          title: 'Old decision',
          date: '2026-01-03',
          owner: 'tim',
          status: 'superseded',
          goal: 'G1',
          evidence: ['I1'],
        },
        '',
      ),
    ).rejects.toThrow(/superseded Decision needs "superseded_by"/)
  })

  it('resolves goal and evidence to a Decision that show can read back', async () => {
    const id = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Second decision',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1', 'F1'],
      },
      '',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.goal).toEqual({ id: 'G1', title: 'Ship faster' })
    expect(record.evidence).toHaveLength(2)
  })
})

describe('setDecisionStatus', () => {
  it('changes a Decision status', async () => {
    await setDecisionStatus(db, 'glue', 'D1', 'proposed')

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('proposed')
  })

  it('rejects superseded without superseded_by', async () => {
    await expect(
      setDecisionStatus(db, 'glue', 'D1', 'superseded'),
    ).rejects.toThrow(/superseded Decision needs "superseded_by"/)

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('accepted')
  })

  it('sets superseded_by when given', async () => {
    const secondId = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Second decision',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1'],
      },
      '',
    )

    await setDecisionStatus(db, 'glue', 'D1', 'superseded', secondId)

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('superseded')
    expect(record.supersededBy).toBe(secondId)
  })

  it('rejects superseded_by when the status is not superseded', async () => {
    const secondId = await addConceptRecord(
      db,
      'glue',
      'decisions',
      {
        title: 'Second decision',
        date: '2026-01-03',
        owner: 'tim',
        status: 'accepted',
        goal: 'G1',
        evidence: ['I1'],
      },
      '',
    )

    await expect(
      setDecisionStatus(db, 'glue', 'D1', 'accepted', secondId),
    ).rejects.toThrow(/"superseded_by" only applies to a superseded Decision/)

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.supersededBy).toBeUndefined()
  })

  it('rejects a Decision that supersedes itself', async () => {
    await expect(
      setDecisionStatus(db, 'glue', 'D1', 'superseded', 'D1'),
    ).rejects.toThrow(/cannot supersede itself/)

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('accepted')
  })
})

function addDraft() {
  return addConceptRecord(
    db,
    'glue',
    'insights',
    {
      title: 'The build failed on a type error',
      date: '2026-03-02',
      source: 'verify ci',
      status: 'draft',
    },
    '',
  )
}

const proposal = {
  title: 'Cache the record pages too',
  date: '2026-03-03',
  owner: 'Ada',
  status: 'proposed',
  goal: 'G1',
  evidence: ['I1'],
}

describe('keepInsight', () => {
  it('makes a draft a normal Insight', async () => {
    const id = await addDraft()

    await keepInsight(db, 'glue', id)

    expect(await listConceptRecords(db, 'glue', 'insights')).toContainEqual({
      id,
      status: '',
      title: 'The build failed on a type error',
    })
  })

  it('refuses an Insight that is not a draft', async () => {
    await expect(keepInsight(db, 'glue', 'I1')).rejects.toThrow(
      /"I1" is not a draft/,
    )
  })

  it('refuses an id without an Insight', async () => {
    await expect(keepInsight(db, 'glue', 'I9')).rejects.toThrow(
      /insight "I9" not found/,
    )
  })
})

describe('discardInsight', () => {
  it('discards a draft', async () => {
    const id = await addDraft()

    await discardInsight(db, 'glue', id)

    const rows = await listConceptRecords(db, 'glue', 'insights')
    expect(rows.map((row) => row.id)).toEqual(['I1'])
  })

  it('does not give the id of a discarded draft to the next Insight', async () => {
    const discarded = await addDraft()
    await discardInsight(db, 'glue', discarded)

    expect([discarded, await addDraft()]).toEqual(['I2', 'I3'])
  })

  it('refuses an Insight that is not a draft and keeps it', async () => {
    await expect(discardInsight(db, 'glue', 'I1')).rejects.toThrow(
      /"I1" is not a draft/,
    )

    const rows = await listConceptRecords(db, 'glue', 'insights')
    expect(rows.map((row) => row.id)).toEqual(['I1'])
  })

  it('refuses a draft that is the evidence of a Decision and keeps it', async () => {
    const id = await addDraft()
    await addConceptRecord(
      db,
      'glue',
      'decisions',
      { ...proposal, evidence: [id] },
      '',
    )

    await expect(discardInsight(db, 'glue', id)).rejects.toThrow(
      /"I2" is the evidence of D2/,
    )

    const rows = await listConceptRecords(db, 'glue', 'insights')
    expect(rows.map((row) => row.id)).toEqual(['I1', 'I2'])
  })
})

describe('a proposed Decision', () => {
  it('has the status proposed, its Goal and its evidence', async () => {
    const draftId = await addDraft()

    const id = await addConceptRecord(
      db,
      'glue',
      'decisions',
      { ...proposal, evidence: [draftId] },
      'Record pages load in 3 s.',
    )

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.fields.status).toBe('proposed')
    expect(record.fields.owner).toBe('Ada')
    expect(record.goal?.id).toBe('G1')
    expect(record.evidence).toEqual([
      { id: draftId, title: 'The build failed on a type error' },
    ])
  })

  it('refuses a Product that does not exist and does not make it', async () => {
    await expect(
      addConceptRecord(db, 'nope', 'decisions', proposal, ''),
    ).rejects.toThrow(/product "nope" not found/)

    await expect(listConceptRecords(db, 'nope')).rejects.toThrow(
      /product "nope" not found/,
    )
  })

  it('says that the Product is missing, so the HTTP API can answer 404', async () => {
    await expect(keepInsight(db, 'nope', 'I1')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    )
  })

  it('refuses a Decision without evidence', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        { ...proposal, evidence: 'I1' },
        '',
      ),
    ).rejects.toThrow(/"evidence" is required/)
  })
})

describe('acceptDecision', () => {
  it('accepts a proposed Decision', async () => {
    const id = await addConceptRecord(db, 'glue', 'decisions', proposal, '')

    await acceptDecision(db, github, 'glue', id)

    const record = await showConceptRecord(db, 'glue', id)
    expect(record.fields.status).toBe('accepted')
  })

  it('refuses a Decision that is not proposed', async () => {
    const id = await addConceptRecord(db, 'glue', 'decisions', proposal, '')
    await setDecisionStatus(db, 'glue', 'D1', 'superseded', id)

    await expect(acceptDecision(db, github, 'glue', 'D1')).rejects.toThrow(
      /"D1" is not proposed/,
    )

    const record = await showConceptRecord(db, 'glue', 'D1')
    expect(record.fields.status).toBe('superseded')
    expect(record.supersededBy).toBe(id)
  })

  it('supersedes a Decision once when two status changes come at the same time', async () => {
    const first = await addConceptRecord(db, 'glue', 'decisions', proposal, '')
    const second = await addConceptRecord(db, 'glue', 'decisions', proposal, '')

    const requests = await Promise.allSettled([
      setDecisionStatus(db, 'glue', 'D1', 'superseded', first),
      setDecisionStatus(db, 'glue', 'D1', 'superseded', second),
    ])

    expect(requests.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ])
    expect(requests.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { message: '"D1" is superseded already' },
    })
  })

  it('refuses an id without a Decision', async () => {
    await expect(acceptDecision(db, github, 'glue', 'D9')).rejects.toThrow(
      /decision "D9" not found/,
    )
  })

  it('accepts a Decision once when two requests come at the same time', async () => {
    await setProductRepository(db, 'glue', 'timschoch/glue-next')
    const id = await addConceptRecord(db, 'glue', 'decisions', proposal, '')

    const requests = await Promise.allSettled([
      acceptDecision(db, github, 'glue', id),
      acceptDecision(db, github, 'glue', id),
    ])

    expect(requests.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ])
    expect(requests.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { message: '"D2" is not proposed' },
    })
    expect(issues).toHaveLength(1)
  })
})

describe('a write that leaves a Decision accepted', () => {
  const accepted = { ...proposal, status: 'accepted' }

  beforeEach(async () => {
    await setProductRepository(db, 'glue', 'timschoch/glue-next')
  })

  it('opens the issue of a Decision that is added as accepted', async () => {
    const added = await addDecision(db, github, 'glue', accepted, '')

    expect(added).toEqual({
      id: 'D2',
      issue: {
        kind: 'created',
        url: 'https://github.com/timschoch/glue-next/issues/1',
      },
    })
    expect(issues.map(({ issue }) => issue.title)).toEqual([
      'D2: Cache the record pages too',
    ])
  })

  it('opens no issue for a Decision that is added as proposed', async () => {
    const added = await addDecision(db, github, 'glue', proposal, '')

    expect(added).toEqual({ id: 'D2', issue: { kind: 'not-accepted' } })
    expect(issues).toEqual([])
  })

  it('opens the issue of a Decision that supersedes another', async () => {
    const added = await addDecision(
      db,
      github,
      'glue',
      { ...accepted, supersedes: 'D1' },
      '',
    )

    expect(added.issue.kind).toBe('created')
    expect(issues.map(({ issue }) => issue.title)).toEqual([
      'D2: Cache the record pages too',
    ])
  })

  it('opens the issue when the status of a Decision becomes accepted', async () => {
    const { id } = await addDecision(db, github, 'glue', proposal, '')

    const updated = await updateDecision(db, github, 'glue', id, 'accepted')

    expect(updated.issue.kind).toBe('created')
    expect(issues).toHaveLength(1)
  })

  it('opens the issue when a person accepts a Decision', async () => {
    const { id } = await addDecision(db, github, 'glue', proposal, '')

    const acceptedDecision = await acceptDecision(db, github, 'glue', id)

    expect(acceptedDecision.issue.kind).toBe('created')
    expect(issues).toHaveLength(1)
  })
})

describe('a Decision that supersedes another', () => {
  const successor = { ...proposal, status: 'accepted', supersedes: 'D1' }

  it('is accepted, names the old Decision, and the old one is superseded by it', async () => {
    const id = await addConceptRecord(db, 'glue', 'decisions', successor, '')

    const added = await showConceptRecord(db, 'glue', id)
    expect(added.fields.status).toBe('accepted')
    expect(added.supersedes).toEqual(['D1'])
    const old = await showConceptRecord(db, 'glue', 'D1')
    expect(old.fields.status).toBe('superseded')
    expect(old.supersededBy).toBe(id)
  })

  it('changes both records in one statement, the Neon HTTP driver has no transaction', async () => {
    const statements: string[] = []
    const logged = drizzle(client, {
      schema,
      logger: { logQuery: (query) => statements.push(query) },
    })

    await addConceptRecord(logged, 'glue', 'decisions', successor, '')

    const writes = statements.filter((statement) =>
      /\b(insert into|update) "decisions"/.test(statement),
    )
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatch(/insert into "decisions"/)
    expect(writes[0]).toMatch(/update "decisions"/)
  })

  it('writes nothing when the evidence does not exist', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        { ...successor, evidence: ['I9'] },
        '',
      ),
    ).rejects.toThrow(/evidence "I9" not found/)

    const rows = await listConceptRecords(db, 'glue', 'decisions')
    expect(rows).toEqual([
      { id: 'D1', status: 'accepted', title: 'Cache the homepage' },
    ])
  })

  it('refuses when the new Decision is not accepted', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        { ...successor, status: 'proposed' },
        '',
      ),
    ).rejects.toThrow(/"supersedes" needs the status "accepted"/)
  })

  it('refuses an old Decision that does not exist', async () => {
    await expect(
      addConceptRecord(
        db,
        'glue',
        'decisions',
        { ...successor, supersedes: 'D9' },
        '',
      ),
    ).rejects.toThrow(/decision "D9" not found/)
  })

  it('refuses an old Decision that is superseded already', async () => {
    await addConceptRecord(db, 'glue', 'decisions', successor, '')

    await expect(
      addConceptRecord(db, 'glue', 'decisions', successor, ''),
    ).rejects.toThrow(/"D1" is superseded already/)

    const rows = await listConceptRecords(db, 'glue', 'decisions')
    expect(rows).toHaveLength(2)
  })

  it('supersedes a Decision once when two requests come at the same time', async () => {
    const requests = await Promise.allSettled([
      addConceptRecord(db, 'glue', 'decisions', successor, ''),
      addConceptRecord(db, 'glue', 'decisions', successor, ''),
    ])

    expect(requests.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ])
    expect(requests.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { message: '"D1" is superseded already' },
    })
    expect(await listConceptRecords(db, 'glue', 'decisions')).toEqual([
      { id: 'D1', status: 'superseded', title: 'Cache the homepage' },
      { id: 'D2', status: 'accepted', title: 'Cache the record pages too' },
    ])
  })
})

describe('the id of a new record', () => {
  it('is different for two records that come at the same time', async () => {
    const fact = { title: 'The cache holds 1 GB', source: 'contract' }

    const ids = await Promise.all([
      addConceptRecord(db, 'glue', 'facts', fact, ''),
      addConceptRecord(db, 'glue', 'facts', fact, ''),
    ])

    expect(ids.sort()).toEqual(['F2', 'F3'])
  })
})
