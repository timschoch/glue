// The gate of a Project from a shell (glue/D48): `pnpm concept gate`. It
// reads the pull request from GitHub and sends it to Glue's HTTP API, as a
// check in the repository of any Project does. It needs no database:
// GLUE_API_TOKEN (a token of the Project), GLUE_API_URL (default: the main
// deployment), GITHUB_REPOSITORY (owner/name, GitHub Actions sets it) and
// GITHUB_TOKEN (only for a private repository).
import { z } from 'zod'

const DEFAULT_API_URL = 'https://glue-glue-glue.vercel.app'
const GITHUB_API_URL = 'https://api.github.com'

const pullRequestSchema = z.object({ body: z.string().nullable() })
const gateSchema = z.object({
  result: z.enum(['holds', 'breaks']),
  reasons: z.array(z.string()),
})

type Environment = Record<string, string | undefined>

export async function fetchGate(
  { project, number }: { project: string; number: number },
  environment: Environment = process.env,
  fetchApi: typeof fetch = fetch,
) {
  const token = environment.GLUE_API_TOKEN
  if (!token) {
    throw new Error(
      `GLUE_API_TOKEN is required: a token of the Project "${project}".`,
    )
  }
  const repository = environment.GITHUB_REPOSITORY
  if (!repository) {
    throw new Error(
      'GITHUB_REPOSITORY is required: the repository of the pull request, as owner/name.',
    )
  }

  const pullUrl = `${GITHUB_API_URL}/repos/${repository}/pulls/${number}`
  const pull = await fetchApi(pullUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'glue',
      ...(environment.GITHUB_TOKEN && {
        authorization: `Bearer ${environment.GITHUB_TOKEN}`,
      }),
    },
  })
  if (!pull.ok) {
    throw new Error(
      `GitHub answered ${pull.status} for GET ${pullUrl}. Check GITHUB_REPOSITORY and GITHUB_TOKEN.`,
    )
  }
  const { body } = pullRequestSchema.parse(await pull.json())

  const gateUrl = new URL(
    `/api/v1/projects/${project}/gate`,
    environment.GLUE_API_URL || DEFAULT_API_URL,
  )
  const response = await fetchApi(gateUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ repository, number, body: body ?? '' }),
    // A path the deployment does not have redirects to the sign-in page.
    redirect: 'manual',
  })
  if (!response.ok) {
    throw new Error(
      `Glue API answered ${response.status} for POST ${gateUrl}. Check GLUE_API_TOKEN and GLUE_API_URL.`,
    )
  }
  return gateSchema.parse(await response.json())
}
