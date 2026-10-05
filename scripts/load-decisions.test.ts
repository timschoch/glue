import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, it, vi } from 'vitest'

import { handleGetPart, handleListParts } from '../src/api/part-api.ts'
import { addPart, addProject } from '../src/db/part-records.ts'
import type { NewPart } from '../src/db/part-records.ts'
import * as schema from '../src/db/schema.ts'
import { createToken } from '../src/db/tokens.ts'
import { createFakeGithub } from '../src/test/github.ts'
import { loadDecisions } from './load-decisions.ts'
import { problems } from './check-pr-workflow.mjs'

const TOKEN = 'glue_read_token'
const PARTS_URL = 'https://glue-glue-glue.vercel.app/api/v1/projects/glue/parts'
const DECISIONS_URL = `${PARTS_URL}?type=decision`
const BUILD_PARTS_URL =
  'https://glue-glue-glue.vercel.app/api/v1/projects/glue-build/parts'

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
  it('reads the Decisions that are Parts, through the real API', async () => {
    const client = new PGlite()
    const db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    await addProject(db, 'glue')
    await addPart(db, 'glue', {
      type: 'goal',
      title: 'Ship faster',
      metric: 'lead time',
      source: 'okr',
    })
    await addPart(db, 'glue', {
      type: 'guardrail',
      title: 'CI takes ten minutes at most',
      enforcedBy: 'verify ci',
    })
    const decision: NewPart = {
      type: 'decision',
      title: 'Check the types before the push',
      owner: 'Ada',
      status: 'accepted',
      needs: ['G1', 'R1'],
    }
    await addPart(db, 'glue', decision)
    await addPart(db, 'glue', { ...decision, supersedes: 'D1' })
    await addPart(db, 'glue', { ...decision, status: 'proposed' })
    const { token } = await createToken(db, 'glue', 'ci')
    // The API of the deployment, with the handlers that its Part routes
    // call. Any other path is a 404, as in the deployment.
    const { github } = createFakeGithub()
    const fetchApi = vi.fn<typeof fetch>(async (url, options) => {
      const path = new URL(String(url)).pathname
      const root = '/api/v1/projects/glue/parts'
      if (!path.startsWith(root))
        return Response.json({ error: { code: 'not-found' } }, { status: 404 })
      const recordId = path.slice(root.length + 1)
      const handle = recordId ? handleGetPart : handleListParts
      return handle({
        db,
        github,
        request: new Request(String(url), { headers: options?.headers }),
        params: { project: 'glue', recordId },
      })
    })

    const decisions = await loadDecisions({ GLUE_API_TOKEN: token }, fetchApi)
    await client.close()

    expect(Object.fromEntries(decisions)).toEqual({
      D1: { status: 'superseded', superseded_by: 'D2' },
      D2: { status: 'accepted' },
      D3: { status: 'proposed' },
      'glue/D1': { status: 'superseded', superseded_by: 'D2' },
      'glue/D2': { status: 'accepted' },
      'glue/D3': { status: 'proposed' },
    })
  })

  it('reads a bare id in the build Project and glue/<id> in Project glue', async () => {
    const fetchApi = fakeFetch({
      [DECISIONS_URL]: [{ id: 'D12', status: 'accepted' }],
      [`${BUILD_PARTS_URL}?type=decision`]: [
        { id: 'D45', status: 'accepted' },
        { id: 'D46', status: 'superseded' },
      ],
      [`${BUILD_PARTS_URL}/D46`]: { supersededBy: { id: 'D45' } },
    })

    const decisions = await loadDecisions({ GLUE_API_TOKEN: TOKEN }, fetchApi)

    expect(Object.fromEntries(decisions)).toEqual({
      D45: { status: 'accepted' },
      D46: { status: 'superseded', superseded_by: 'D45' },
      'glue-build/D45': { status: 'accepted' },
      'glue-build/D46': { status: 'superseded', superseded_by: 'D45' },
      'glue/D12': { status: 'accepted' },
    })
    expect(
      problems({
        body: 'Closes #1\nDecision: glue-build/D45',
        files: [],
        decisions,
      }),
    ).toEqual([])
  })

  it('reads a bare id in the Project of GLUE_PROJECT', async () => {
    const fetchApi = fakeFetch({
      [DECISIONS_URL]: [{ id: 'D12', status: 'accepted' }],
      'https://glue-glue-glue.vercel.app/api/v1/projects/flexibeck/parts?type=decision':
        [{ id: 'D3', status: 'proposed' }],
    })

    const decisions = await loadDecisions(
      { GLUE_API_TOKEN: TOKEN, GLUE_PROJECT: 'flexibeck' },
      fetchApi,
    )

    expect(Object.fromEntries(decisions)).toEqual({
      D3: { status: 'proposed' },
      'flexibeck/D3': { status: 'proposed' },
      'glue/D12': { status: 'accepted' },
    })
  })

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
      [`${PARTS_URL}/D1`]: {
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
      'http://localhost:3000/api/v1/projects/glue/parts?type=decision': [
        { id: 'D7', status: 'proposed' },
      ],
    })

    const decisions = await loadDecisions(
      { GLUE_API_TOKEN: TOKEN, GLUE_API_URL: 'http://localhost:3000' },
      fetchApi,
    )

    expect([...decisions.keys()]).toEqual(['D7', 'glue/D7'])
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
