// The newest Contract Version of a Concept of the Project `glue`, read over
// Glue's HTTP API on the main deployment, as load-decisions.ts reads the
// Decisions.
import { z } from 'zod'

import type { NewestContract } from './check-pr-workflow.mjs'

const DEFAULT_API_URL = 'https://glue-glue-glue.vercel.app'

const contractSchema = z.object({ version: z.number() })

type Environment = Record<string, string | undefined>

export async function loadNewestContract(
  concept: string,
  environment: Environment = process.env,
  fetchApi: typeof fetch = fetch,
): Promise<NewestContract> {
  const token = environment.GLUE_API_TOKEN
  if (!token) {
    throw new Error(
      'GLUE_API_TOKEN is required: a read token of the Project "glue".',
    )
  }
  const url = new URL(
    `/api/v1/projects/glue/concepts/${concept}/contract`,
    environment.GLUE_API_URL || DEFAULT_API_URL,
  )
  const response = await fetchApi(url, {
    headers: { authorization: `Bearer ${token}` },
    // A path the deployment does not have redirects to the sign-in page.
    redirect: 'manual',
  })
  // The Concept has no Contract Version, or the Project has no such Concept.
  if (response.status === 404) return { concept, newestVersion: undefined }
  if (!response.ok) {
    throw new Error(
      `Glue API answered ${response.status} for GET ${url}. Check GLUE_API_TOKEN and GLUE_API_URL.`,
    )
  }
  const { version } = contractSchema.parse(await response.json())
  return { concept, newestVersion: version }
}
