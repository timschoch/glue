// The HTTP API of the builds of a Project (D28). The server route in
// src/routes/api/ reaches this handler through concept-routes.ts. The schema
// here documents the answer in openapi.ts.
import { z } from 'zod'

import { listBuilds } from '../db/builds.ts'
import type { ProjectBuilds } from '../db/builds.ts'
import { handleApiRequest } from './concept-api.ts'
import type { ChangeRequest } from './concept-api.ts'
import { partSummarySchema } from './part-api.ts'

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
