// The HTTP API of the Signals of a Project (D30). The server routes in
// src/routes/api/ reach these handlers through part-routes.ts. The
// schemas here document the answers in openapi.ts.
import { z } from 'zod'

import { createPartOperations } from '../db/part-operations.ts'
import { listSignals, signalInsightSchema } from '../db/signals.ts'
import type { ProjectSignals } from '../db/signals.ts'
import { createSignalSources } from '../signals/signal-sources.server.ts'
import { handleApiRequest, parseJson } from './api-request.ts'
import type { ChangeRequest } from './api-request.ts'
import { toChangedPartResponse } from './part-api.ts'
import { parseFilterId } from './signal-filter-api.ts'

export const projectSignalsSchema = z
  .object({
    signals: z.array(
      z.object({
        url: z
          .string()
          .meta({ description: 'The address of the Signal in its tool' }),
        title: z.string(),
        titleBy: z.literal('glue').optional().meta({
          description:
            'glue: Glue gave the title. Then the text says what the Signal is about',
        }),
        text: z.string().meta({
          description: 'What the user said or did. Empty: the tool has none',
        }),
        date: z.iso.date().meta({ description: 'The day it came in' }),
        source: z.string().meta({
          description:
            'The source: github, support, analytics, social or market',
        }),
        insight: z
          .object({ id: z.string(), title: z.string() })
          .nullable()
          .meta({ description: 'The Insight that grew from the Signal' }),
      }),
    ),
    failures: z
      .array(z.object({ source: z.string(), reason: z.string() }))
      .meta({ description: 'The sources that did not answer, and why' }),
    groups: z
      .array(
        z.object({
          title: z.string().meta({
            description:
              'What its newest Signal is about: the title, or the text when Glue gave the title',
          }),
          signals: z.array(z.string()).meta({
            description:
              'The addresses of its Signals. addSignalInsight turns them into a Hunch',
          }),
          sources: z
            .array(z.string())
            .meta({ description: 'The sources that gave its Signals' }),
        }),
      )
      .meta({
        description:
          'The groups of Signals that say the same thing. A Signal that grew into an Insight is in no group',
      }),
  })
  .meta({ id: 'ProjectSignals' }) satisfies z.ZodType<ProjectSignals>

export const signalInsightInputSchema = signalInsightSchema.meta({
  id: 'SignalInsightInput',
})

export function handleListSignals(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const query = new URL(input.request.url).searchParams
    const source = query.get('source') ?? undefined
    const filterId = query.get('filter') ?? undefined
    const filter =
      filterId === undefined ? undefined : parseFilterId({ filterId })
    return Response.json(
      await listSignals(
        input.db,
        createSignalSources(input.github),
        input.params.project,
        { source, filter },
      ),
    )
  })
}

export function handleAddSignalInsight(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const insight = signalInsightSchema.parse(await parseJson(input.request))
    const added = await createPartOperations(input).addSignalInsight(
      input.params.project,
      insight,
    )
    return toChangedPartResponse(added, 201)
  })
}
