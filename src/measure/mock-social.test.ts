import { describe, expect, it } from 'vitest'

import { createMockSocialChannel } from './mock-social.ts'

const READ_KEY = 'local-read-key'

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
      'http://localhost:4001/api/comments?handle=flexibeck&since=2026-09-28T00%3A00%3A00.000Z',
    )
    expect(request.headers.get('authorization')).toBe(`Bearer ${READ_KEY}`)
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

    await channel.fetchComments({ handle: 'flexibeck', since: null })

    expect(requests[0].url).toBe(
      'http://localhost:4001/api/comments?handle=flexibeck',
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
      channel.fetchComments({ handle: 'flexibeck', since: null }),
    ).rejects.toThrow(/401/)
  })
})
