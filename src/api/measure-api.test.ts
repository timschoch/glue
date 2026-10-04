import { beforeEach, describe, expect, it } from 'vitest'

import { addPart, addProject } from '../db/part-records.ts'
import { setAnalyticsProject } from '../db/projects.ts'
import * as schema from '../db/schema.ts'
import { createTestDatabase } from '../db/test-database.ts'
import { createToken } from '../db/tokens.ts'
import type { MetricSource } from '../measure/metric-source.ts'
import { handleMeasureProject } from './measure-api.ts'

const { db } = createTestDatabase(schema)
let token: string

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
  await addProject(db, 'flexibeck')
  ;({ token } = await createToken(db, 'flexibeck', 'orchestrator'))
  await setAnalyticsProject(db, 'flexibeck', 'phc_flexibeck')
  await addPart(db, 'flexibeck', {
    type: 'goal',
    title: 'Ship faster',
    metric: 'lead time',
    source: 'okr',
    measure: {
      kind: 'funnel',
      source: 'mock-analytics',
      steps: ['signed-up', 'paid'],
      target: 0.25,
      window_days: 7,
    },
  })
})

function request(sent?: string) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (sent) headers.set('authorization', `Bearer ${sent}`)
  return new Request('http://localhost/api/v1', { method: 'POST', headers })
}

describe('POST /measure', () => {
  it('answers 401 without a token', async () => {
    const response = await handleMeasureProject({
      db,
      request: request(),
      params: { project: 'flexibeck' },
      source,
    })

    expect(response.status).toBe(401)
  })

  it('measures the Goals of the Product and returns the new Insights', async () => {
    const response = await handleMeasureProject({
      db,
      request: request(token),
      params: { project: 'flexibeck' },
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
