// The HTTP API of the Signals of a Project (D30). The server routes in
// src/routes/api/ reach these handlers through concept-routes.ts. The
// schemas here document the answers in openapi.ts.
import { z } from 'zod'

import { findPart } from '../db/parts.ts'
import {
  addSignalInsight,
  listSignals,
  signalInsightSchema,
} from '../db/signals.ts'
import type { ProjectSignals } from '../db/signals.ts'
import { handleApiRequest, parseJson } from './concept-api.ts'
import type { ChangeRequest } from './concept-api.ts'

export const projectSignalsSchema = z
  .object({
    signals: z.array(
      z.object({
        url: z.string().meta({ description: 'The address of the issue' }),
        title: z.string(),
        date: z.iso.date().meta({ description: 'The day it was opened' }),
        insight: z
          .object({ id: z.string(), title: z.string() })
          .nullable()
          .meta({ description: 'The Insight that grew from the Signal' }),
      }),
    ),
    reason: z.string().nullable().meta({
      description:
        'Why there are no Signals: the Project has no repository, or GitHub failed',
    }),
  })
  .meta({ id: 'ProjectSignals' }) satisfies z.ZodType<ProjectSignals>

export const signalInsightInputSchema = signalInsightSchema.meta({
  id: 'SignalInsightInput',
})

export function handleListSignals(input: ChangeRequest) {
  return handleApiRequest(input, async () =>
    Response.json(
      await listSignals(input.db, input.github, input.params.project),
    ),
  )
}

export function handleAddSignalInsight(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { db, github, request, params } = input
    const insight = signalInsightSchema.parse(await parseJson(request))
    const recordId = await addSignalInsight(db, github, params.project, insight)
    return Response.json(await findPart(db, params.project, recordId), {
      status: 201,
    })
  })
}
