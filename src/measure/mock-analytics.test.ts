import { describe, expect, it } from 'vitest'

import { createMockAnalyticsSource } from './mock-analytics.ts'

const READ_KEY = 'local-read-key'

const query = {
  project: 'phc_demo',
  steps: ['signed-up', 'paid'],
  from: new Date('2026-09-23T00:00:00Z'),
  to: new Date('2026-09-30T00:00:00Z'),
  breakdown: 'app_version',
}

// Answers every request with `response` and keeps the requests it got.
function createFakeFetch(response: Response) {
  const requests: Request[] = []
  const fakeFetch: typeof fetch = (input, init) => {
    requests.push(new Request(input, init))
    return Promise.resolve(response)
  }
  return { fakeFetch, requests }
}

describe('createMockAnalyticsSource', () => {
  it('posts the funnel query with the read key and returns the results', async () => {
    const step = { conversion_from_previous: 1, conversion_from_first: 1 }
    const { fakeFetch, requests } = createFakeFetch(
      Response.json({
        results: [
          {
            breakdown: '1.2',
            steps: [
              { event: 'signed-up', count: 60, ...step },
              { event: 'paid', count: 6, ...step },
            ],
          },
        ],
      }),
    )
    const source = createMockAnalyticsSource({
      url: 'http://localhost:4000/',
      readKey: READ_KEY,
      fetch: fakeFetch,
    })

    const results = await source.fetchFunnel(query)

    expect(results).toEqual([
      {
        breakdown: '1.2',
        steps: [
          { event: 'signed-up', count: 60 },
          { event: 'paid', count: 6 },
        ],
      },
    ])
    const [request] = requests
    expect(request.method).toBe('POST')
    expect(request.url).toBe('http://localhost:4000/api/funnel')
    expect(request.headers.get('authorization')).toBe(`Bearer ${READ_KEY}`)
    expect(await request.json()).toEqual({
      project: 'phc_demo',
      steps: ['signed-up', 'paid'],
      from: '2026-09-23T00:00:00.000Z',
      to: '2026-09-30T00:00:00.000Z',
      breakdown: 'app_version',
    })
  })

  it('posts the mean query with the read key and returns the results', async () => {
    const { fakeFetch, requests } = createFakeFetch(
      Response.json({
        results: [
          {
            breakdown: 'team',
            count: 12,
            mean: 5.5,
            lastSeenAt: '2026-09-29T08:00:00.000Z',
          },
          { breakdown: 'free', count: 0, mean: null, lastSeenAt: null },
        ],
      }),
    )
    const source = createMockAnalyticsSource({
      url: 'http://localhost:4000/',
      readKey: READ_KEY,
      fetch: fakeFetch,
    })

    const results = await source.fetchMean({
      project: 'phc_demo',
      event: 'survey sent',
      property: '$survey_response',
      from: new Date('2026-09-23T00:00:00Z'),
      to: new Date('2026-09-30T00:00:00Z'),
      where: { property: '$survey_id', value: 'seq' },
      breakdown: 'plan',
    })

    expect(results).toEqual([
      {
        breakdown: 'team',
        count: 12,
        mean: 5.5,
        lastSeenAt: new Date('2026-09-29T08:00:00Z'),
      },
      { breakdown: 'free', count: 0, mean: null, lastSeenAt: null },
    ])
    const [request] = requests
    expect(request.url).toBe('http://localhost:4000/api/mean')
    expect(request.headers.get('authorization')).toBe(`Bearer ${READ_KEY}`)
    expect(await request.json()).toEqual({
      project: 'phc_demo',
      event: 'survey sent',
      property: '$survey_response',
      from: '2026-09-23T00:00:00.000Z',
      to: '2026-09-30T00:00:00.000Z',
      where: { property: '$survey_id', value: 'seq' },
      breakdown: 'plan',
    })
  })

  it('throws with the status when mock analytics refuses the query', async () => {
    const { fakeFetch } = createFakeFetch(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    )
    const source = createMockAnalyticsSource({
      url: 'http://localhost:4000',
      readKey: 'wrong',
      fetch: fakeFetch,
    })

    await expect(source.fetchFunnel(query)).rejects.toThrow(/401/)
  })
})
