// The Decisions that a PR can name, read over Glue's HTTP API
// (src/api/openapi.ts) on the main deployment. The deployed code always
// fits the deployed schema, so a branch that changes the schema still passes.
//
// A bare id (`D45`) is a Decision of the build Project: the one of
// GLUE_PROJECT, or `glue-build` when the API has it, or `glue`. `glue/D12`
// is a Decision of the Project `glue` (D45).
import { z } from 'zod'

import { BUILD_PROJECT, CONCEPT_PROJECT } from '../src/db/projects.ts'
import type { Decision } from './check-pr-workflow.mjs'

const DEFAULT_API_URL = 'https://glue-glue-glue.vercel.app'

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
      'GLUE_API_TOKEN is required: a read token of the build Project.',
    )
  }
  const apiUrl = environment.GLUE_API_URL || DEFAULT_API_URL

  // undefined: the API has no such Project for the token, and the caller
  // said that this is no failure.
  async function read(path: string, optional = false): Promise<unknown> {
    const url = new URL(path, apiUrl)
    const response = await fetchApi(url, {
      headers: { authorization: `Bearer ${token}` },
      // A path the deployment does not have redirects to the sign-in page.
      redirect: 'manual',
    })
    if (optional && response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(
        `Glue API answered ${response.status} for GET ${url}. Check GLUE_API_TOKEN and GLUE_API_URL.`,
      )
    }
    return response.json()
  }

  // The Decisions of one Project, by their record id.
  async function readDecisions(project: string, optional = false) {
    const partsPath = `/api/v1/projects/${project}/parts`
    const found = await read(`${partsPath}?type=decision`, optional)
    if (found === undefined) return undefined
    return Promise.all(
      decisionSummariesSchema.parse(found).map(async ({ id, status }) => {
        if (status !== 'superseded') return [id, { status }] as const
        const { supersededBy } = decisionSchema.parse(
          await read(`${partsPath}/${id}`),
        )
        return [id, { status, superseded_by: supersededBy?.id }] as const
      }),
    )
  }

  const conceptDecisions = (await readDecisions(CONCEPT_PROJECT)) ?? []
  const named = environment.GLUE_PROJECT
  const buildDecisions =
    named === CONCEPT_PROJECT
      ? conceptDecisions
      : ((await readDecisions(named || BUILD_PROJECT, !named)) ??
        conceptDecisions)
  return new Map<string, Decision>([
    ...buildDecisions,
    ...conceptDecisions.map(
      ([id, decision]) => [`${CONCEPT_PROJECT}/${id}`, decision] as const,
    ),
  ])
}
