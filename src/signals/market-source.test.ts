import { describe, expect, it } from 'vitest'

// The test reads the Mock itself, so the adapter and the Mock cannot drift
// apart. The adapter never imports the Mock.
import { createApp } from '../../mocks/market/src/create-app.ts'
import { createMarketSource } from './market-source.ts'

const app = createApp({
  findings: [
    {
      id: 2,
      title: 'Coding agents get rules as free text',
      summary: 'No tool in the sample checks a build against its rules.',
      published_at: '2026-09-22T08:00:00Z',
    },
  ],
})

// Sends each request to the Mock and keeps its address.
function createMockFetch() {
  const asked: string[] = []
  const mockFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    asked.push(request.url)
    return app.request(request)
  }
  return { mockFetch, asked }
}

const glue = {
  repository: null,
  analyticsProject: null,
  supportUrl: null,
  socialHandle: null,
  marketUrl: 'https://market.test/',
}

describe('createMarketSource', () => {
  it('reads the findings of the market analysis of the Project', async () => {
    const { mockFetch, asked } = createMockFetch()
    const source = createMarketSource({ fetch: mockFetch })

    const signals = await source.listSignals(glue)

    expect(asked).toEqual(['https://market.test/api/findings'])
    expect(signals).toEqual([
      {
        url: 'https://market.test/findings/2',
        title: 'Coding agents get rules as free text',
        text: 'No tool in the sample checks a build against its rules.',
        date: '2026-09-22',
      },
    ])
  })

  it('drops a finding with a link that is not http or https', async () => {
    const finding = {
      title: 'Coding agents get rules as free text',
      summary: 'No tool in the sample checks a build against its rules.',
      published_at: '2026-09-22T08:00:00Z',
    }
    const source = createMarketSource({
      fetch: () =>
        Promise.resolve(
          Response.json({
            findings: [
              { ...finding, url: 'javascript:alert(1)' },
              { ...finding, url: 'https://market.test/findings/3' },
              { ...finding, url: 'ftp://market.test/findings/4' },
              { ...finding, url: 'http://market.test/findings/5' },
            ],
          }),
        ),
    })

    const signals = await source.listSignals(glue)

    expect(signals.map(({ url }) => url)).toEqual([
      'https://market.test/findings/3',
      'http://market.test/findings/5',
    ])
  })

  it('has the name market', () => {
    expect(createMarketSource().name).toBe('market')
  })

  it('gives no Signal and asks nothing for a Project without a market analysis', async () => {
    const { mockFetch, asked } = createMockFetch()
    const source = createMarketSource({ fetch: mockFetch })

    const signals = await source.listSignals({ ...glue, marketUrl: null })

    expect(signals).toEqual([])
    expect(asked).toEqual([])
  })

  it('fails with the status when the market analysis refuses', async () => {
    const source = createMarketSource({
      fetch: () => Promise.resolve(new Response('down', { status: 503 })),
    })

    await expect(source.listSignals(glue)).rejects.toThrow(
      'Market answered 503: down',
    )
  })
})
