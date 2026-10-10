import { describe, expect, it } from 'vitest'

import { IntegrationReadError } from '../db/integrations.ts'
import { createPosthogTool } from './posthog-tool.ts'

// No real key: the fake PostHog takes each one.
const KEY = 'key-of-the-team-1234'

// PostHog with no request: it keeps each call and gives this answer.
function createFakePosthog(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const send: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json(body, { status })
  }
  return { calls, send }
}

const lowScores = {
  results: [
    [
      '0199a1b2-0000-7000-8000-000000000001',
      '2026-10-02T09:30:00.000000Z',
      '2',
      'I did not find the export',
    ],
    ['0199a1b2-0000-7000-8000-000000000002', '2026-10-01T07:00:00Z', 3, null],
  ],
}

describe('createPosthogTool', () => {
  it('shows its Signals under the source analytics', () => {
    expect(createPosthogTool(fetch).source).toBe('analytics')
  })

  it('asks the project in its region for the low survey answers, with the key of the team', async () => {
    const { calls, send } = createFakePosthog(200, lowScores)

    await createPosthogTool(send).listSignals('eu/12345', KEY)

    expect(calls).toHaveLength(1)
    const [{ url, init }] = calls
    expect(url).toBe('https://eu.posthog.com/api/projects/12345/query/')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer key-of-the-team-1234',
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      query: {
        kind: 'HogQLQuery',
        query:
          "select uuid, timestamp, properties.$survey_response, properties.comment from events where event = 'survey sent' and toFloat(properties.$survey_response) <= 3 and timestamp >= now() - interval 30 day order by timestamp desc limit 100",
      },
    })
  })

  it('makes one Signal of each answer, like the Signals of the Mock', async () => {
    const { send } = createFakePosthog(200, lowScores)

    const signals = await createPosthogTool(send).listSignals('eu/12345', KEY)

    expect(signals).toEqual([
      {
        url: 'https://eu.posthog.com/project/12345/events/0199a1b2-0000-7000-8000-000000000001/2026-10-02T09%3A30%3A00.000000Z',
        title: 'Survey answer 2 of 7',
        titleBy: 'glue',
        text: 'I did not find the export',
        date: '2026-10-02',
      },
      {
        url: 'https://eu.posthog.com/project/12345/events/0199a1b2-0000-7000-8000-000000000002/2026-10-01T07%3A00%3A00Z',
        title: 'Survey answer 3 of 7',
        titleBy: 'glue',
        text: '',
        date: '2026-10-01',
      },
    ])
  })

  it('asks the server of the region us for a project there', async () => {
    const { calls, send } = createFakePosthog(200, { results: [] })

    const signals = await createPosthogTool(send).listSignals('us/7', KEY)

    expect(signals).toEqual([])
    expect(calls[0].url).toBe('https://us.posthog.com/api/projects/7/query/')
  })

  it.each([
    [401, 'key', 'PostHog refused the key'],
    [403, 'key', 'The key cannot read the events of the project 12345'],
    [
      404,
      'address',
      'PostHog has no project 12345 in the region eu that the key can read',
    ],
  ])(
    'names the place to change when PostHog answers %i: the %s',
    async (status, place, message) => {
      const { send } = createFakePosthog(status, { detail: 'No.' })

      const refused = createPosthogTool(send).listSignals('eu/12345', KEY)

      await expect(refused).rejects.toThrow(IntegrationReadError)
      await expect(refused).rejects.toMatchObject({ message, place })
    },
  )

  it('keeps another failure of PostHog as it is', async () => {
    const { send } = createFakePosthog(503, { detail: 'Down.' })

    const failed = createPosthogTool(send).listSignals('eu/12345', KEY)

    await expect(failed).rejects.toThrow(
      'PostHog answered 503: {"detail":"Down."}',
    )
    await expect(failed).rejects.not.toThrow(IntegrationReadError)
  })

  it.each(['eu/12345', 'us/7'])('takes the address %s', (address) => {
    expect(createPosthogTool(fetch).findAddressProblem(address)).toBeUndefined()
  })

  it.each([
    '12345',
    'de/12345',
    'eu/shop',
    'eu/12345/../7',
    'https://evil.example.com/12345',
    'eu.posthog.com.evil.example.com/1',
  ])('refuses the address %s, and asks no server', async (address) => {
    const { calls, send } = createFakePosthog(200, { results: [] })
    const tool = createPosthogTool(send)

    expect(tool.findAddressProblem(address)).toBe(
      'A PostHog project is the region and the id, for example eu/12345',
    )
    await expect(tool.listSignals(address, KEY)).rejects.toThrow(
      'A PostHog project is the region and the id, for example eu/12345',
    )
    expect(calls).toEqual([])
  })
})
