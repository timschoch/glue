import { describe, expect, it } from 'vitest'

// The test reads the Mock itself, so the adapter and the Mock cannot drift
// apart. The adapter never imports the Mock.
import { createApp } from '../../mocks/support/src/create-app.ts'
import { createSupportSource } from './support-source.ts'

const app = createApp({
  tickets: [
    {
      id: 4,
      subject: 'A Flagged record does not say what changed',
      description: 'Three of my records are yellow.',
      status: 'open',
      created_at: '2026-09-26T15:20:00Z',
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
  supportUrl: 'https://support.test/',
}

describe('createSupportSource', () => {
  it('reads the tickets of the help desk of the Project', async () => {
    const { mockFetch, asked } = createMockFetch()
    const source = createSupportSource({ fetch: mockFetch })

    const signals = await source.listSignals(glue)

    expect(asked).toEqual(['https://support.test/api/v2/tickets.json'])
    expect(signals).toEqual([
      {
        url: 'https://support.test/agent/tickets/4',
        title: 'A Flagged record does not say what changed',
        text: 'Three of my records are yellow.',
        date: '2026-09-26',
      },
    ])
  })

  it('has the name support', () => {
    expect(createSupportSource().name).toBe('support')
  })

  it('gives no Signal and asks nothing for a Project without a help desk', async () => {
    const { mockFetch, asked } = createMockFetch()
    const source = createSupportSource({ fetch: mockFetch })

    const signals = await source.listSignals({ ...glue, supportUrl: null })

    expect(signals).toEqual([])
    expect(asked).toEqual([])
  })

  it('fails with the status when the help desk refuses', async () => {
    const source = createSupportSource({
      fetch: () => Promise.resolve(new Response('down', { status: 503 })),
    })

    await expect(source.listSignals(glue)).rejects.toThrow(
      'support answered 503: down',
    )
  })
})
