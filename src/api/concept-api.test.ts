import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  addConceptRecord,
  setAnalyticsProject,
  setProductRepository,
} from '../db/concept-records.ts'
import * as schema from '../db/schema.ts'
import { createToken } from '../db/tokens.ts'
import type { GithubClient, IssueInput } from '../github/client.ts'
import { createFakeGithub, failingGithub } from '../test/github.ts'
import {
  handleAddRecord,
  handleGetConcept,
  handleGetRecord,
  handleListRecords,
  handleMeasureProduct,
  handleUpdateRecord,
} from './concept-api.ts'
import type { ApiRequest } from './concept-api.ts'
import type { MetricSource } from '../measure/metric-source.ts'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let token: string
let github: GithubClient
let issues: { repository: string; issue: IssueInput }[]

beforeEach(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  ;({ github, issues } = createFakeGithub())
  ;({ token } = await createToken(db, 'flexibeck', 'orchestrator'))
  await setProductRepository(db, 'flexibeck', 'timschoch/flexibeck-next')
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
    'facts',
    { title: 'p95 load time is 3s', source: 'monitoring' },
    '',
  )
  await addConceptRecord(
    db,
    'glue',
    'facts',
    { title: 'Glue keeps the why', source: 'readme' },
    '',
  )
})

afterEach(async () => {
  await client.close()
})

type Params = ApiRequest['params']

function request(
  method: string,
  options: { token?: string; body?: unknown } = {},
) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (options.token) headers.set('authorization', `Bearer ${options.token}`)
  return new Request('http://localhost/api/v1', {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

async function call(
  handler: (input: ApiRequest & { github: GithubClient }) => Promise<Response>,
  method: string,
  params: Params,
  body?: unknown,
) {
  const response = await handler({
    db,
    github,
    request: request(method, { token, body }),
    params,
  })
  return { status: response.status, body: await response.json() }
}

describe('authentication', () => {
  it('answers 401 without a token', async () => {
    const response = await handleGetConcept({
      db,
      request: request('GET'),
      params: { product: 'flexibeck' },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'unauthorized', message: expect.any(String) },
    })
  })

  it('answers 401 with a wrong token', async () => {
    const response = await handleGetConcept({
      db,
      request: request('GET', { token: 'glue_wrong' }),
      params: { product: 'flexibeck' },
    })

    expect(response.status).toBe(401)
  })

  it('answers 404 for another Product', async () => {
    const response = await call(handleGetConcept, 'GET', { product: 'glue' })

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('not-found')
  })

  it('accepts the Bearer scheme in any case, RFC 7235', async () => {
    const headers = new Headers({
      'content-type': 'application/json',
      authorization: `bearer ${token}`,
    })
    const response = await handleGetConcept({
      db,
      request: new Request('http://localhost/api/v1', { headers }),
      params: { product: 'flexibeck' },
    })

    expect(response.status).toBe(200)
  })
})

describe('GET /concept', () => {
  it('returns the records of the Product grouped by type', async () => {
    const response = await call(handleGetConcept, 'GET', {
      product: 'flexibeck',
    })

    expect(response.status).toBe(200)
    expect(response.body.product.slug).toBe('flexibeck')
    expect(response.body.goals).toEqual([
      {
        id: 'G1',
        title: 'Ship faster',
        metric: 'lead time',
        status: 'open',
        latestValue: null,
      },
    ])
    expect(response.body.facts).toEqual([
      { id: 'F1', title: 'p95 load time is 3s' },
    ])
  })
})

describe('Insights', () => {
  it('adds an Insight and reads it back', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'insights' },
      {
        title: 'Users churn on slow loads',
        date: '2026-09-30',
        source: 'interviews',
        body: 'Five of eight said so.',
        status: 'draft',
      },
    )
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ kind: 'insight', id: 'I1' })

    const read = await call(handleGetRecord, 'GET', {
      product: 'flexibeck',
      folder: 'insights',
      recordId: 'I1',
    })
    expect(read.status).toBe(200)
    expect(read.body).toEqual({
      kind: 'insight',
      id: 'I1',
      title: 'Users churn on slow loads',
      date: '2026-09-30',
      source: 'interviews',
      status: 'draft',
      body: 'Five of eight said so.',
      decisions: [],
    })

    const listed = await call(handleListRecords, 'GET', {
      product: 'flexibeck',
      folder: 'insights',
    })
    expect(listed.body).toEqual([
      {
        id: 'I1',
        title: 'Users churn on slow loads',
        date: '2026-09-30',
        status: 'draft',
      },
    ])
  })

  it('answers 400 for an Insight without a title', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'insights' },
      { source: 'interviews' },
    )

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid-request')
    expect(response.body.error.message).toContain('title')
  })

  it('answers 400 for a body that is not JSON', async () => {
    const response = await handleAddRecord({
      db,
      github,
      request: new Request('http://localhost/api/v1', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: '{',
      }),
      params: { product: 'flexibeck', folder: 'insights' },
    })

    expect(response.status).toBe(400)
  })
})

describe('Facts', () => {
  it('adds a Fact', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'facts' },
      { title: 'The budget is 0', source: 'owner' },
    )

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ kind: 'fact', id: 'F2', body: '' })
  })
})

describe('Decisions', () => {
  const decision = {
    title: 'Cache the homepage',
    date: '2026-09-30',
    owner: 'orchestrator',
    status: 'accepted',
    goal: 'G1',
    evidence: ['F1'],
    body: 'Cache reads at the edge.',
  }

  it('adds a Decision with its evidence', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      decision,
    )

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({
      kind: 'decision',
      id: 'D1',
      goal: { id: 'G1', title: 'Ship faster' },
      evidence: [{ id: 'F1', title: 'p95 load time is 3s' }],
    })
  })

  it('answers 400 for evidence that does not exist', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      { ...decision, evidence: ['I9'] },
    )

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('evidence "I9" not found')
  })

  it('answers 400 for evidence of another Product', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      { ...decision, evidence: ['F2'] },
    )

    expect(response.status).toBe(400)
  })

  it('answers 400 for a Decision without evidence', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      { ...decision, evidence: [] },
    )

    expect(response.status).toBe(400)
  })

  it('supersedes a Decision by another', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, decision)
    await call(handleAddRecord, 'POST', params, {
      ...decision,
      title: 'Cache every page',
    })

    const updated = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'D1' },
      { status: 'superseded', superseded_by: 'D2' },
    )

    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({
      id: 'D1',
      status: 'superseded',
      supersededBy: { id: 'D2', title: 'Cache every page' },
    })
  })

  it('opens one issue for a Decision added as accepted', async () => {
    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      decision,
    )

    expect(added.body.issueUrl).toBe(
      'https://github.com/timschoch/flexibeck-next/issues/1',
    )
    expect(issues.map(({ issue }) => issue.title)).toEqual([
      'D1: Cache the homepage',
    ])
  })

  it('opens the issue when a Decision moves to accepted, once', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, {
      ...decision,
      status: 'proposed',
    })
    expect(issues).toEqual([])

    const accepted = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'D1' },
      { status: 'accepted' },
    )
    await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'D1' },
      { status: 'accepted' },
    )

    expect(accepted.status).toBe(200)
    expect(accepted.body.issueUrl).toBe(
      'https://github.com/timschoch/flexibeck-next/issues/1',
    )
    expect(issues).toHaveLength(1)
  })

  it('keeps the Decision accepted and reports the missing issue when GitHub fails', async () => {
    github = failingGithub

    const added = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'decisions' },
      decision,
    )

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({
      status: 'accepted',
      issueUrl: null,
      issueError: 'GitHub answered 503',
    })
  })

  it('adds a Decision that supersedes another, and the old one names it', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, decision)

    const added = await call(handleAddRecord, 'POST', params, {
      ...decision,
      title: 'Cache every page',
      supersedes: 'D1',
    })

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({
      id: 'D2',
      status: 'accepted',
      supersedes: [{ id: 'D1', title: 'Cache the homepage' }],
    })
    const old = await call(handleGetRecord, 'GET', {
      ...params,
      recordId: 'D1',
    })
    expect(old.body).toMatchObject({
      status: 'superseded',
      supersededBy: { id: 'D2', title: 'Cache every page' },
    })
  })

  it('answers 400 for a proposed Decision that supersedes another', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, decision)

    const response = await call(handleAddRecord, 'POST', params, {
      ...decision,
      status: 'proposed',
      supersedes: 'D1',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe(
      '"supersedes" needs the status "accepted"',
    )
  })

  it('answers 400 for a superseded Decision without superseded_by', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    await call(handleAddRecord, 'POST', params, decision)

    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'D1' },
      { status: 'superseded' },
    )

    expect(response.status).toBe(400)
  })

  it('answers 404 for a Decision that does not exist', async () => {
    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { product: 'flexibeck', folder: 'decisions', recordId: 'D9' },
      { status: 'accepted' },
    )

    expect(response.status).toBe(404)
  })

  it('gives two Decisions that follow each other different ids', async () => {
    const params = { product: 'flexibeck', folder: 'decisions' }
    const responses = await Promise.all([
      call(handleAddRecord, 'POST', params, decision),
      call(handleAddRecord, 'POST', params, decision),
    ])

    expect(responses.map((response) => response.status)).toEqual([201, 201])
    expect(new Set(responses.map(({ body }) => body.id)).size).toBe(2)
  })
})

describe('paths that name no record', () => {
  it('answers 404 for a record of another folder', async () => {
    const response = await call(handleGetRecord, 'GET', {
      product: 'flexibeck',
      folder: 'goals',
      recordId: 'F1',
    })

    expect(response.status).toBe(404)
  })

  it('answers 404 for a folder that does not exist', async () => {
    const response = await call(handleListRecords, 'GET', {
      product: 'flexibeck',
      folder: 'ideas',
    })

    expect(response.status).toBe(404)
  })

  it('answers 404 for a Guardrail added over the API', async () => {
    const response = await call(
      handleAddRecord,
      'POST',
      { product: 'flexibeck', folder: 'guardrails' },
      { title: 'No paid tools', enforced_by: 'review' },
    )

    expect(response.status).toBe(404)
  })

  it('answers 404 for an update to a Fact', async () => {
    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { product: 'flexibeck', folder: 'facts', recordId: 'F1' },
      { title: 'p95 load time is 2s' },
    )

    expect(response.status).toBe(404)
  })
})

describe('Goals', () => {
  const measure = {
    kind: 'funnel',
    source: 'mock-analytics',
    steps: ['signed-up', 'paid'],
    target: 0.25,
    window_days: 7,
  }
  const params = { product: 'flexibeck', folder: 'goals' }

  it('adds a Goal with a measure', async () => {
    const added = await call(handleAddRecord, 'POST', params, {
      title: 'More users pay',
      metric: 'signup to paid',
      source: 'okr',
      measure,
    })

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ kind: 'goal', id: 'G2', measure })
  })

  it('answers 400 for a measure with a target above 1', async () => {
    const response = await call(handleAddRecord, 'POST', params, {
      title: 'More users pay',
      metric: 'signup to paid',
      source: 'okr',
      measure: { ...measure, target: 25 },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('target')
  })

  // The Product's analytics project is set with the CLI, not per Goal, so a
  // token cannot read another Product's analytics.
  it('answers 400 for a measure that names an analytics project', async () => {
    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'G1' },
      { measure: { ...measure, project: 'phc_other' } },
    )

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('project')
  })

  it('sets and removes the measure of a Goal', async () => {
    const set = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'G1' },
      { measure },
    )
    expect(set.status).toBe(200)
    expect(set.body).toMatchObject({ id: 'G1', measure })

    const removed = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'G1' },
      { measure: null },
    )
    expect(removed.body).toMatchObject({ id: 'G1', measure: null })
  })

  it('answers 404 for a Goal that does not exist', async () => {
    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'G9' },
      { measure },
    )

    expect(response.status).toBe(404)
  })

  it('adds an open Goal with a mean measure and no baseline yet', async () => {
    const meanMeasure = {
      kind: 'mean',
      source: 'mock-analytics',
      event: 'survey sent',
      property: '$survey_response',
      where: { property: '$survey_id', value: 'seq' },
      target_change: 1,
      window_days: 7,
    }

    const added = await call(handleAddRecord, 'POST', params, {
      title: 'Planning feels easy',
      metric: 'SEQ mean',
      source: 'okr',
      measure: meanMeasure,
    })

    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({
      measure: meanMeasure,
      status: 'open',
      baseline: null,
      latestValue: null,
      measuredAt: null,
    })
  })

  it('closes a Goal as achieved and keeps its measure', async () => {
    const recordParams = { ...params, recordId: 'G1' }
    await call(handleUpdateRecord, 'PATCH', recordParams, { measure })

    const closed = await call(handleUpdateRecord, 'PATCH', recordParams, {
      status: 'achieved',
    })
    const read = await call(handleGetRecord, 'GET', recordParams)

    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({ status: 'achieved', measure })
    expect(read.body).toMatchObject({ status: 'achieved' })
  })

  it('answers 400 for a Goal status other than open or achieved', async () => {
    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'G1' },
      { status: 'done' },
    )

    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('status')
  })

  it('answers 400 for a Goal update without a field', async () => {
    const response = await call(
      handleUpdateRecord,
      'PATCH',
      { ...params, recordId: 'G1' },
      {},
    )

    expect(response.status).toBe(400)
  })
})

describe('POST /measure', () => {
  const projects: string[] = []
  // Every funnel converts 10% from the first to the last step.
  const source: MetricSource = {
    fetchFunnel: ({ project, steps }) => {
      projects.push(project)
      return Promise.resolve([
        {
          breakdown: null,
          steps: steps.map((event, index) => ({
            event,
            count: index === 0 ? 100 : 10,
          })),
        },
      ])
    },
    fetchMean: () => Promise.resolve([]),
  }

  beforeEach(async () => {
    projects.length = 0
    await setAnalyticsProject(db, 'flexibeck', 'phc_flexibeck')
    await call(
      handleUpdateRecord,
      'PATCH',
      { product: 'flexibeck', folder: 'goals', recordId: 'G1' },
      {
        measure: {
          kind: 'funnel',
          source: 'mock-analytics',
          steps: ['signed-up', 'paid'],
          target: 0.25,
          window_days: 7,
        },
      },
    )
  })

  it('answers 401 without a token', async () => {
    const response = await handleMeasureProduct({
      db,
      request: request('POST'),
      params: { product: 'flexibeck' },
      source,
    })

    expect(response.status).toBe(401)
  })

  it('measures the Goals of the Product and returns the new Insights', async () => {
    const response = await handleMeasureProduct({
      db,
      request: request('POST', { token }),
      params: { product: 'flexibeck' },
      source,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      insights: [
        {
          id: 'I1',
          goal: 'G1',
          title: expect.stringContaining('below the target of 25%'),
        },
      ],
      skipped: [],
    })
    expect(new Set(projects)).toEqual(new Set(['phc_flexibeck']))
  })
})
