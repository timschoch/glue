import { describe, expect, it } from 'vitest'

import { createMockSocialChannel } from './mock-social.ts'

const READ_KEY = 'local-read-key'

const until = new Date('2026-09-30T09:59:50Z')

// Answers every request with `response` and keeps the requests it got.
function createFakeFetch(response: Response) {
  const requests: Request[] = []
  const fakeFetch: typeof fetch = (input, init) => {
    requests.push(new Request(input, init))
    return Promise.resolve(response)
  }
  return { fakeFetch, requests }
}

describe('createMockSocialChannel', () => {
  it('reads the comments of a handle after `since` with the read key', async () => {
    const { fakeFetch, requests } = createFakeFetch(
      Response.json({
        comments: [
          {
            id: 'c1',
            author: 'ada',
            text: 'Love it',
            created_at: '2026-09-29T10:00:00.123Z',
          },
        ],
      }),
    )
    const channel = createMockSocialChannel({
      url: 'http://localhost:4001/',
      readKey: READ_KEY,
      fetch: fakeFetch,
    })

    const comments = await channel.fetchComments({
      handle: 'flexibeck',
      since: new Date('2026-09-28T00:00:00Z'),
      until,
    })

    expect(comments).toEqual([
      {
        author: 'ada',
        text: 'Love it',
        createdAt: new Date('2026-09-29T10:00:00.123Z'),
      },
    ])
    const [request] = requests
    expect(request.method).toBe('GET')
    expect(request.url).toBe(
      'http://localhost:4001/api/comments?handle=flexibeck&since=2026-09-28T00%3A00%3A00.000Z&until=2026-09-30T09%3A59%3A50.000Z',
    )
    expect(request.headers.get('authorization')).toBe(`Bearer ${READ_KEY}`)
  })

  it('gives up on a read after a timeout', async () => {
    const signals: Array<AbortSignal | null | undefined> = []
    const channel = createMockSocialChannel({
      url: 'http://localhost:4001',
      readKey: READ_KEY,
      fetch: (_input, init) => {
        signals.push(init?.signal)
        return Promise.resolve(Response.json({ comments: [] }))
      },
    })

    await channel.fetchComments({ handle: 'flexibeck', since: null, until })

    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })

  it('reads every comment without `since`', async () => {
    const { fakeFetch, requests } = createFakeFetch(
      Response.json({ comments: [] }),
    )
    const channel = createMockSocialChannel({
      url: 'http://localhost:4001',
      readKey: READ_KEY,
      fetch: fakeFetch,
    })

    await channel.fetchComments({ handle: 'flexibeck', since: null, until })

    expect(requests[0].url).toBe(
      'http://localhost:4001/api/comments?handle=flexibeck&until=2026-09-30T09%3A59%3A50.000Z',
    )
  })

  it('throws with the status when mock social refuses the read', async () => {
    const { fakeFetch } = createFakeFetch(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    )
    const channel = createMockSocialChannel({
      url: 'http://localhost:4001',
      readKey: 'wrong',
      fetch: fakeFetch,
    })

    await expect(
      channel.fetchComments({ handle: 'flexibeck', since: null, until }),
    ).rejects.toThrow(/401/)
  })
})
