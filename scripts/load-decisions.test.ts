import { describe, expect, it, vi } from 'vitest'

import { loadDecisions } from './load-decisions.ts'
import { problems } from './check-pr-workflow.mjs'

const TOKEN = 'glue_read_token'
const DECISIONS_URL =
  'https://glue-glue-glue.vercel.app/api/v1/projects/glue/decisions'

// The Glue API as the gate sees it: one JSON answer per URL. A URL without
// an answer is a 404, as in the real API.
function fakeFetch(answers: Record<string, unknown>) {
  return vi.fn<typeof fetch>(async (url) => {
    const answer = answers[String(url)]
    return answer === undefined
      ? Response.json({ error: { code: 'not-found' } }, { status: 404 })
      : Response.json(answer)
  })
}

describe('loadDecisions', () => {
  it('reads an accepted Decision over the API, with the token as Bearer', async () => {
    const fetchApi = fakeFetch({
      [DECISIONS_URL]: [{ id: 'D1', status: 'accepted' }],
    })

    const decisions = await loadDecisions({ GLUE_API_TOKEN: TOKEN }, fetchApi)

    expect(
      problems({
        body: 'Closes #1\nDecision: D1',
        files: [],
        decisions,
      }),
    ).toEqual([])
    const [url, options] = fetchApi.mock.calls[0]
    expect(String(url)).toBe(DECISIONS_URL)
    expect(new Headers(options?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`,
    )
  })

  it('reads a superseded Decision, naming its replacement', async () => {
    const fetchApi = fakeFetch({
      [DECISIONS_URL]: [
        { id: 'D1', status: 'superseded' },
        { id: 'D2', status: 'accepted' },
      ],
      [`${DECISIONS_URL}/D1`]: {
        id: 'D1',
        status: 'superseded',
        supersededBy: { id: 'D2', title: 'Cache every page' },
      },
    })

    const decisions = await loadDecisions({ GLUE_API_TOKEN: TOKEN }, fetchApi)

    const [found] = problems({
      body: 'Closes #1\nDecision: D1',
      files: [],
      decisions,
    })
    expect(found).toMatch(/D1/)
    expect(found).toMatch(/D2/)
  })

  it('fails an unknown Decision id', async () => {
    const fetchApi = fakeFetch({
      [DECISIONS_URL]: [{ id: 'D1', status: 'accepted' }],
    })

    const decisions = await loadDecisions({ GLUE_API_TOKEN: TOKEN }, fetchApi)

    const [found] = problems({
      body: 'Closes #1\nDecision: D99',
      files: [],
      decisions,
    })
    expect(found).toMatch(/D99/)
  })

  it('reads from the API that GLUE_API_URL names', async () => {
    const fetchApi = fakeFetch({
      'http://localhost:3000/api/v1/projects/glue/decisions': [
        { id: 'D7', status: 'proposed' },
      ],
    })

    const decisions = await loadDecisions(
      { GLUE_API_TOKEN: TOKEN, GLUE_API_URL: 'http://localhost:3000' },
      fetchApi,
    )

    expect([...decisions.keys()]).toEqual(['D7'])
  })

  it('fails without a token, naming the variable, before any request', async () => {
    const fetchApi = fakeFetch({})

    await expect(loadDecisions({}, fetchApi)).rejects.toThrow(/GLUE_API_TOKEN/)
    await expect(
      loadDecisions({ GLUE_API_TOKEN: '' }, fetchApi),
    ).rejects.toThrow(/GLUE_API_TOKEN/)
    expect(fetchApi).not.toHaveBeenCalled()
  })

  it('fails on a 401, naming the status and never the token', async () => {
    const fetchApi = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: { code: 'unauthorized', message: 'send a valid token' } },
        { status: 401 },
      ),
    )

    const failure = await loadDecisions(
      { GLUE_API_TOKEN: TOKEN },
      fetchApi,
    ).catch((error: Error) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toMatch(/401/)
    expect((failure as Error).message).toMatch(/GLUE_API_TOKEN/)
    expect((failure as Error).message).not.toContain(TOKEN)
  })

  it('does not follow a redirect to the sign-in page', async () => {
    const fetchApi = fakeFetch({
      [DECISIONS_URL]: [{ id: 'D1', status: 'accepted' }],
    })

    await loadDecisions({ GLUE_API_TOKEN: TOKEN }, fetchApi)

    expect(fetchApi.mock.calls[0][1]?.redirect).toBe('manual')
  })
})
