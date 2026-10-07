// The saved filters of the Signals of a Project in the HTTP API (glue/D66).
// The schemas here document the answers in openapi.ts.
import { z } from 'zod'

import { SignalFilterNotFoundError } from '../db/record-errors.ts'
import {
  addSignalFilter,
  listSignalFilters,
  removeSignalFilter,
  signalFilterSchema,
  updateSignalFilter,
} from '../db/signal-filters.ts'
import type { SignalFilter } from '../db/signal-filters.ts'
import { handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

export const savedSignalFilterSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    mustHold: z.array(z.string()).meta({
      description: 'The Signal holds each word, in its title or its text',
    }),
    mustNotHold: z
      .array(z.string())
      .meta({ description: 'The Signal holds none of the words' }),
    sources: z.array(z.string()).meta({
      description: 'The names of the sources. None: each source passes',
    }),
  })
  .meta({ id: 'SignalFilter' }) satisfies z.ZodType<SignalFilter>

export const signalFilterInputSchema = signalFilterSchema.meta({
  id: 'SignalFilterInput',
})

const FILTER_ID = /^\d+$/

// An id that is no number names no filter.
export function parseFilterId({ filterId = '' }: { filterId?: string }) {
  if (!FILTER_ID.test(filterId)) throw new SignalFilterNotFoundError(filterId)
  return Number(filterId)
}

export function handleListSignalFilters(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await listSignalFilters(input.db, input.params.project)),
  )
}

export function handleAddSignalFilter(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const filter = signalFilterInputSchema.parse(await parseJson(request))
    return Response.json(await addSignalFilter(db, params.project, filter), {
      status: 201,
    })
  })
}

export function handleUpdateSignalFilter(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const filterId = parseFilterId(params)
    const filter = signalFilterInputSchema.parse(await parseJson(request))
    return Response.json(
      await updateSignalFilter(db, params.project, filterId, filter),
    )
  })
}

export function handleRemoveSignalFilter(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, params } = input
    await removeSignalFilter(db, params.project, parseFilterId(params))
    return new Response(null, { status: 204 })
  })
}
