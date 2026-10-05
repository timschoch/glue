import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { main } from './concept.ts'

const environment = {
  GLUE_API_TOKEN: 'glue_gate_token',
  GLUE_API_URL: 'https://glue.example',
  GITHUB_REPOSITORY: 'timschoch/flexibeck-next',
  GITHUB_TOKEN: 'github_token',
}

// GitHub has the pull request 12 with the body. The gate of Glue answers
// with `gate`.
function fakeFetch(body: string, gate: unknown) {
  return vi.fn<typeof fetch>(async (url) =>
    String(url).startsWith('https://api.github.com/')
      ? Response.json({ number: 12, body })
      : Response.json(gate),
  )
}

describe('pnpm concept gate', () => {
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('sends the pull request to the gate of the Project, with no database', async () => {
    const fetchApi = fakeFetch('Contract: videos@2', {
      result: 'holds',
      reasons: [],
      checkedAt: '2026-10-05T08:00:00.000Z',
    })

    await main(
      ['gate', '--pr', '12', '--project', 'flexibeck'],
      undefined,
      environment,
      fetchApi,
    )

    const [[pullUrl, pullOptions], [gateUrl, gateOptions]] = fetchApi.mock.calls
    expect(String(pullUrl)).toBe(
      'https://api.github.com/repos/timschoch/flexibeck-next/pulls/12',
    )
    expect(new Headers(pullOptions?.headers).get('authorization')).toBe(
      'Bearer github_token',
    )
    expect(String(gateUrl)).toBe(
      'https://glue.example/api/v1/projects/flexibeck/gate',
    )
    expect(gateOptions?.method).toBe('POST')
    expect(new Headers(gateOptions?.headers).get('authorization')).toBe(
      'Bearer glue_gate_token',
    )
    expect(JSON.parse(String(gateOptions?.body))).toEqual({
      repository: 'timschoch/flexibeck-next',
      number: 12,
      body: 'Contract: videos@2',
    })
    expect(log).toHaveBeenCalledWith('#12  holds')
    expect(process.exitCode).toBeUndefined()
  })

  it('prints the reasons and exits 1 when the build breaks', async () => {
    const fetchApi = fakeFetch('Contract: videos@1', {
      result: 'breaks',
      reasons: ['Contract "videos@1" is not the newest Version.'],
      checkedAt: '2026-10-05T08:00:00.000Z',
    })

    await main(['gate', '--pr', '12'], undefined, environment, fetchApi)

    expect(log).toHaveBeenCalledWith('#12  breaks')
    expect(error).toHaveBeenCalledWith(
      '  - Contract "videos@1" is not the newest Version.',
    )
    expect(process.exitCode).toBe(1)
  })

  it('fails when the gate fails, and names the status', async () => {
    const fetchApi = vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.github.com/')
        ? Response.json({ number: 12, body: '' })
        : Response.json({}, { status: 401 }),
    )

    await expect(
      main(['gate', '--pr', '12'], undefined, environment, fetchApi),
    ).rejects.toThrow('Glue API answered 401')
  })
})
