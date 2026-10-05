// The HTTP API of the builds of a Project (D28) and of its gate (glue/D48).
// The server route in
// src/routes/api/ reaches this handler through part-routes.ts. The schema
// here documents the answer in openapi.ts.
import { z } from 'zod'

import { listBuilds } from '../db/builds.ts'
import type { ProjectBuilds } from '../db/builds.ts'
import { gateResults, validateBuild } from '../db/gate.ts'
import type { Gate } from '../db/gate.ts'
import { handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest, ChangeRequest } from './api-request.ts'
import { partSummarySchema } from './part-api.ts'

export const gateSchema = z
  .object({
    result: z.enum(gateResults).meta({
      description:
        '`holds`: the build names the newest Contract Version, or Decisions that stand. `breaks`: see `reasons`',
    }),
    reasons: z.array(z.string()).meta({
      description:
        'Why the build breaks: the Contract Version is not the newest one, a Decision is sunk or superseded, or the body names no Decision and no Contract Version',
    }),
    checkedAt: z.iso.datetime(),
  })
  .meta({ id: 'Gate' }) satisfies z.ZodType<Gate>

export const validatedBuildSchema = z
  .strictObject({
    repository: z.string().trim().min(1).meta({
      description: 'The repository of the pull request, as owner/name',
    }),
    number: z.int().positive().meta({
      description: 'The number of the pull request',
    }),
    body: z.string().meta({
      description:
        'The body of the pull request, or only its lines "Decision:" and "Contract:"',
    }),
  })
  .meta({ id: 'ValidatedBuild' })

export const projectBuildsSchema = z
  .object({
    builds: z.array(
      z.object({
        number: z.int().meta({ description: 'The number of the pull request' }),
        url: z.string().meta({ description: 'The address in GitHub' }),
        title: z.string(),
        state: z.enum(['open', 'merged']),
        decisions: z.array(partSummarySchema).meta({
          description: 'The Decisions that the line "Decision:" names',
        }),
        contract: z
          .object({
            concept: z
              .string()
              .meta({ description: 'The slug of the Concept' }),
            title: z.string(),
            version: z.int(),
            newestVersion: z.int(),
          })
          .nullable()
          .meta({
            description: 'The Contract Version that the line "Contract:" names',
          }),
        gate: gateSchema.nullable().meta({
          description:
            'What the gate said the last time. null: no gate checked the build',
        }),
        stale: z.boolean().meta({
          description:
            'The Contract Version is not the newest one, or a Decision is sunk',
        }),
      }),
    ),
    reason: z.string().nullable().meta({
      description:
        'Why there are no builds: the Project has no repository, or GitHub failed',
    }),
  })
  .meta({ id: 'ProjectBuilds' }) satisfies z.ZodType<ProjectBuilds>

export function handleListBuilds(input: ChangeRequest) {
  return handleApiRequest(input, async () =>
    Response.json(
      await listBuilds(input.db, input.github, input.params.project),
    ),
  )
}

// The gate (glue/D48): a check in the repository of the Project sends its
// pull request. Glue answers `holds` or `breaks` and keeps the answer.
export function handleValidateBuild(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const build = validatedBuildSchema.parse(await parseJson(input.request))
    return Response.json(
      await validateBuild(input.db, input.params.project, build),
    )
  })
}
