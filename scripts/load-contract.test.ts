import { describe, expect, it, vi } from 'vitest'

import { problems } from './check-pr-workflow.mjs'
import { loadNewestContract } from './load-contract.ts'

const TOKEN = 'glue_read_token'
const CONTRACT_URL =
  'https://glue-glue-glue.vercel.app/api/v1/projects/glue/concepts/videos/contract'

function fakeFetch(status: number, answer: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(answer, { status }))
}

describe('loadNewestContract', () => {
  it('reads the newest Contract Version over the API, with the token as Bearer', async () => {
    const fetchApi = fakeFetch(200, { concept: 'videos', version: 2 })

    const contract = await loadNewestContract(
      'videos',
      { GLUE_API_TOKEN: TOKEN },
      fetchApi,
    )

    expect(contract).toEqual({ concept: 'videos', newestVersion: 2 })
    const [url, options] = fetchApi.mock.calls[0]
    expect(String(url)).toBe(CONTRACT_URL)
    expect(new Headers(options?.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`,
    )
    expect(
      problems({
        body: 'Closes #1\nContract: videos@1',
        files: [],
        decisions: new Map(),
        contract,
      }),
    ).toHaveLength(1)
  })

  it('reads a Concept without a Contract Version as one with no newest Version', async () => {
    const contract = await loadNewestContract(
      'videos',
      { GLUE_API_TOKEN: TOKEN },
      fakeFetch(404, { error: { code: 'not-found' } }),
    )

    expect(contract).toEqual({ concept: 'videos', newestVersion: undefined })
  })

  it('fails when the API fails, and names the status', async () => {
    await expect(
      loadNewestContract(
        'videos',
        { GLUE_API_TOKEN: TOKEN },
        fakeFetch(401, {}),
      ),
    ).rejects.toThrow('Glue API answered 401')
  })

  it('fails without a token', async () => {
    await expect(loadNewestContract('videos', {})).rejects.toThrow(
      'GLUE_API_TOKEN is required',
    )
  })
})
