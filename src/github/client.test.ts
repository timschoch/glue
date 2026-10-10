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

describe('listIssues', () => {
  const LIST_URL = `${REPOSITORY_URL}/issues?labels=user-feedback&state=all&per_page=100`

  it('reads the issues with the label, without the pull requests', async () => {
    stubGithub({
      [`GET ${LIST_URL}`]: [
        200,
        [
          {
            html_url: 'https://github.com/timschoch/glue/issues/7',
            title: 'The list is slow',
            body: 'It takes five seconds to open.',
            created_at: '2026-10-02T08:00:00Z',
          },
          {
            html_url: 'https://github.com/timschoch/glue/pull/8',
            title: 'Make the list fast',
            created_at: '2026-10-03T08:00:00Z',
            pull_request: {},
          },
        ],
      ],
    })

    const issues = await createGithubClient().listIssues(
      'timschoch/glue',
      'user-feedback',
    )

    expect(issues).toEqual([
      {
        url: 'https://github.com/timschoch/glue/issues/7',
        title: 'The list is slow',
        body: 'It takes five seconds to open.',
        createdAt: '2026-10-02T08:00:00Z',
      },
    ])
  })

  it('throws with the status when GitHub refuses', async () => {
    stubGithub({ [`GET ${LIST_URL}`]: [404, { message: 'Not Found' }] })

    await expect(
      createGithubClient().listIssues('timschoch/glue', 'user-feedback'),
    ).rejects.toThrow(/GitHub list issues: 404/)
  })

  it('gives the status of the answer that GitHub refused with', async () => {
    stubGithub({ [`GET ${LIST_URL}`]: [401, { message: 'Bad credentials' }] })

    await expect(
      createGithubClient().listIssues('timschoch/glue', 'user-feedback'),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('asks with the token of the server, or with the token it was made with', async () => {
    const sent: unknown[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(new Headers(init.headers).get('authorization'))
      return Response.json([])
    })

    await createGithubClient().listIssues('timschoch/glue', 'user-feedback')
    await createGithubClient(() => 'token-of-the-team').listIssues(
      'acme/shop',
      'user-feedback',
    )

    expect(sent).toEqual(['Bearer github_test', 'Bearer token-of-the-team'])
  })
})

describe('searchPullRequests', () => {
  const SEARCH_URL =
    'https://api.github.com/search/issues?q=repo%3Atimschoch%2Fglue+is%3Apr+in%3Abody+%22D44%22&sort=created&order=desc&per_page=100'

  it('reads in one request the open and the merged pull requests with the text in their body', async () => {
    stubGithub({
      [`GET ${SEARCH_URL}`]: [
        200,
        {
          items: [
            {
              number: 256,
              html_url: 'https://github.com/timschoch/glue/pull/256',
              title: 'Show each build of a Decision',
              state: 'open',
              body: 'Decision: D44',
              pull_request: { merged_at: null },
            },
            {
              number: 240,
              html_url: 'https://github.com/timschoch/glue/pull/240',
              title: 'Read the builds',
              state: 'closed',
              body: null,
              pull_request: { merged_at: '2026-10-04T10:00:00Z' },
            },
            {
              number: 239,
              html_url: 'https://github.com/timschoch/glue/pull/239',
              title: 'A try that nobody merged',
              state: 'closed',
              body: 'Decision: D44',
              pull_request: { merged_at: null },
            },
          ],
        },
      ],
    })

    const found = await createGithubClient().searchPullRequests(
      'timschoch/glue',
      'D44',
    )

    expect(found).toEqual([
      {
        number: 256,
        url: 'https://github.com/timschoch/glue/pull/256',
        title: 'Show each build of a Decision',
        state: 'open',
        body: 'Decision: D44',
      },
      {
        number: 240,
        url: 'https://github.com/timschoch/glue/pull/240',
        title: 'Read the builds',
        state: 'merged',
        body: '',
      },
    ])
    expect(calls).toEqual([{ method: 'GET', url: SEARCH_URL }])
  })

  it('throws with the status when GitHub refuses', async () => {
    stubGithub({ [`GET ${SEARCH_URL}`]: [403, { message: 'rate limit' }] })

    await expect(
      createGithubClient().searchPullRequests('timschoch/glue', 'D44'),
    ).rejects.toThrow(/GitHub search pull requests: 403/)
  })
})

describe('listCheckRuns', () => {
  const PULL_URL = `${REPOSITORY_URL}/pulls/12`
  const CHECKS_URL = `${REPOSITORY_URL}/commits/abc123/check-runs?per_page=100`
  const passed = { name: 'verify', status: 'completed', conclusion: 'success' }

  it('reads the checks on the head commit of the pull request, each with its state', async () => {
    stubGithub({
      [`GET ${PULL_URL}`]: [200, { head: { sha: 'abc123' } }],
      [`GET ${CHECKS_URL}&page=1`]: [
        200,
        {
          check_runs: [
            passed,
            { name: 'docs', status: 'completed', conclusion: 'neutral' },
            { name: 'ai-review', status: 'completed', conclusion: 'skipped' },
            { name: 'audit', status: 'completed', conclusion: 'failure' },
            { name: 'release', status: 'in_progress', conclusion: null },
          ],
        },
      ],
    })

    const checks = await createGithubClient().listCheckRuns(
      'timschoch/glue',
      12,
    )

    expect(checks).toEqual([
      { name: 'verify', state: 'passed' },
      { name: 'docs', state: 'passed' },
      { name: 'ai-review', state: 'waiting' },
      { name: 'audit', state: 'failed' },
      { name: 'release', state: 'waiting' },
    ])
  })

  it('reads each page of the checks, so a check after the first 100 counts', async () => {
    stubGithub({
      [`GET ${PULL_URL}`]: [200, { head: { sha: 'abc123' } }],
      [`GET ${CHECKS_URL}&page=1`]: [
        200,
        { check_runs: Array.from({ length: 100 }, () => passed) },
      ],
      [`GET ${CHECKS_URL}&page=2`]: [
        200,
        {
          check_runs: [
            { name: 'audit', status: 'completed', conclusion: 'failure' },
          ],
        },
      ],
    })

    const checks = await createGithubClient().listCheckRuns(
      'timschoch/glue',
      12,
    )

    expect(checks).toHaveLength(101)
    expect(checks[100]).toEqual({ name: 'audit', state: 'failed' })
    expect(calls.map(({ url }) => url)).toEqual([
      PULL_URL,
      `${CHECKS_URL}&page=1`,
      `${CHECKS_URL}&page=2`,
    ])
  })

  it('throws with the status when GitHub refuses', async () => {
    stubGithub({ [`GET ${PULL_URL}`]: [404, { message: 'Not Found' }] })

    await expect(
      createGithubClient().listCheckRuns('timschoch/glue', 12),
    ).rejects.toThrow(/GitHub read pull request: 404/)
  })
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
