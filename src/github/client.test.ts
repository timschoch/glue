import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGithubClient } from './client.ts'

type Call = { method: string; url: string; body?: unknown }

let calls: Call[]

// GitHub as the REST API answers: each route gives one status and body.
function stubGithub(routes: Record<string, [number, unknown]>) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({
      method,
      url,
      ...(init.body && { body: JSON.parse(String(init.body)) }),
    })
    const [status, body] = routes[`${method} ${url}`]
    return Response.json(body, { status })
  })
}

const REPOSITORY_URL = 'https://api.github.com/repos/timschoch/glue'
const issue = { title: 'D1: Cache', body: 'Decision: D1', labels: ['ready'] }

beforeEach(() => {
  calls = []
  vi.stubEnv('GITHUB_TOKEN', 'github_test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('createIssue', () => {
  it('creates a missing label, then the issue, and returns its address', async () => {
    stubGithub({
      [`GET ${REPOSITORY_URL}/labels/ready`]: [404, {}],
      [`POST ${REPOSITORY_URL}/labels`]: [201, {}],
      [`POST ${REPOSITORY_URL}/issues`]: [
        201,
        { html_url: 'https://github.com/timschoch/glue/issues/7' },
      ],
    })

    const url = await createGithubClient().createIssue('timschoch/glue', issue)

    expect(url).toBe('https://github.com/timschoch/glue/issues/7')
    expect(calls).toEqual([
      { method: 'GET', url: `${REPOSITORY_URL}/labels/ready` },
      {
        method: 'POST',
        url: `${REPOSITORY_URL}/labels`,
        body: { name: 'ready', color: expect.any(String) },
      },
      { method: 'POST', url: `${REPOSITORY_URL}/issues`, body: issue },
    ])
  })

  it('keeps a label that exists', async () => {
    stubGithub({
      [`GET ${REPOSITORY_URL}/labels/ready`]: [200, { name: 'ready' }],
      [`POST ${REPOSITORY_URL}/issues`]: [
        201,
        { html_url: 'https://github.com/timschoch/glue/issues/8' },
      ],
    })

    await createGithubClient().createIssue('timschoch/glue', issue)

    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST'])
  })

  it('throws with the status when GitHub refuses the issue', async () => {
    stubGithub({
      [`GET ${REPOSITORY_URL}/labels/ready`]: [200, { name: 'ready' }],
      [`POST ${REPOSITORY_URL}/issues`]: [403, { message: 'Forbidden' }],
    })

    await expect(
      createGithubClient().createIssue('timschoch/glue', issue),
    ).rejects.toThrow(/GitHub create issue: 403/)
  })
})
