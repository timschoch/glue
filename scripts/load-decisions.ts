// The Decisions of the Project `glue`, read over Glue's HTTP API
// (src/api/openapi.ts) on the main deployment. The deployed code always
// fits the deployed schema, so a branch that changes the schema still passes.
import { z } from 'zod'

import type { Decision } from './check-pr-workflow.mjs'

const DEFAULT_API_URL = 'https://glue-glue-glue.vercel.app'
const PARTS_PATH = '/api/v1/projects/glue/parts'

const decisionSummariesSchema = z.array(
  z.object({
    id: z.string(),
    status: z.enum(['proposed', 'accepted', 'superseded']),
  }),
)
// The list leaves out the links of a Decision. Only the Part has them.
const decisionSchema = z.object({
  supersededBy: z.object({ id: z.string() }).nullable(),
})

type Environment = Record<string, string | undefined>

export async function loadDecisions(
  environment: Environment = process.env,
  fetchApi: typeof fetch = fetch,
) {
  const token = environment.GLUE_API_TOKEN
  if (!token) {
    throw new Error(
      'GLUE_API_TOKEN is required: a read token of the Project "glue".',
    )
  }
  const apiUrl = environment.GLUE_API_URL || DEFAULT_API_URL

  async function read(path: string): Promise<unknown> {
    const url = new URL(path, apiUrl)
    const response = await fetchApi(url, {
      headers: { authorization: `Bearer ${token}` },
      // A path the deployment does not have redirects to the sign-in page.
      redirect: 'manual',
    })
    if (!response.ok) {
      throw new Error(
        `Glue API answered ${response.status} for GET ${url}. Check GLUE_API_TOKEN and GLUE_API_URL.`,
      )
    }
    return response.json()
  }

  const summaries = decisionSummariesSchema.parse(
    await read(`${PARTS_PATH}?type=decision`),
  )
  const entries = await Promise.all(
    summaries.map(async ({ id, status }) => {
      if (status !== 'superseded') return [id, { status }] as const
      const { supersededBy } = decisionSchema.parse(
        await read(`${PARTS_PATH}/${id}`),
      )
      return [id, { status, superseded_by: supersededBy?.id }] as const
    }),
  )
  return new Map<string, Decision>(entries)
}
