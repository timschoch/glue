// The people of a Project in the HTTP API: its members, their assignments
// and the Parts that they watch. The handlers stay free of TanStack and of `process.env`, so
// a test calls them with a `Request` and a PGlite database.
import { z } from 'zod'

import {
  addMember,
  assign,
  assignmentRoles,
  assignmentTargetSchema,
  listAssignments,
  listMembers,
  listWatchers,
  loopSteps,
  newAssignmentSchema,
  unassign,
  unwatch,
  watch,
  watcherSchema,
} from '../db/members.ts'
import { handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

export const memberSchema = z
  .object({
    id: z.number(),
    userId: z.string().meta({ description: 'The id of the account' }),
    name: z.string(),
    email: z.string(),
    loopSteps: z
      .array(z.enum(loopSteps))
      .meta({ description: 'The usual loop steps of the member' }),
  })
  .meta({ id: 'Member' })

export const assignmentSchema = z
  .object({
    id: z.number(),
    memberId: z.number(),
    role: z.enum(assignmentRoles),
    concept: z
      .string()
      .nullable()
      .meta({ description: 'The slug of the Concept, or null for a Part' }),
    part: z.string().nullable().meta({
      description: 'The record id of the Part, or null for a Concept',
    }),
  })
  .meta({ id: 'Assignment' })

export const memberInputSchema = z
  .strictObject({
    email: z
      .string()
      .trim()
      .min(1)
      .meta({ description: 'The e-mail address of an account' }),
  })
  .meta({ id: 'MemberInput' })

export const assignmentInputSchema = newAssignmentSchema.meta({
  id: 'AssignmentInput',
  description:
    'The e-mail address of the member, the role, and a Concept or a Part',
})

export const watcherOutputSchema = z
  .object({
    memberId: z.number(),
    part: z.string().meta({ description: 'The record id of the Part' }),
  })
  .meta({ id: 'Watcher' })

export const watcherInputSchema = watcherSchema.meta({
  id: 'WatcherInput',
  description: 'The e-mail address of the member and the record id of a Part',
})

// With `part`: the watchers of that Part only.
export const watchersQuerySchema = z.object({
  part: z.string().optional().meta({ description: 'The record id of a Part' }),
})

export function handleListMembers(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await listMembers(input.db, input.params.project)),
  )
}

export function handleAddMember(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { email } = memberInputSchema.parse(await parseJson(request))
    return Response.json(await addMember(db, params.project, email), {
      status: 201,
    })
  })
}

export function handleListAssignments(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await listAssignments(input.db, input.params.project)),
  )
}

export function handleAssign(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    await assign(db, params.project, await parseJson(request))
    return Response.json(await listAssignments(db, params.project), {
      status: 201,
    })
  })
}

export function handleUnassign(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const query = Object.fromEntries(new URL(request.url).searchParams)
    await unassign(db, params.project, assignmentTargetSchema.parse(query))
    return new Response(null, { status: 204 })
  })
}

export function handleListWatchers(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const query = Object.fromEntries(new URL(request.url).searchParams)
    const { part } = watchersQuerySchema.parse(query)
    return Response.json(await listWatchers(db, params.project, part))
  })
}

export function handleWatch(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const watcher = watcherInputSchema.parse(await parseJson(request))
    await watch(db, params.project, watcher)
    return Response.json(await listWatchers(db, params.project, watcher.part), {
      status: 201,
    })
  })
}

export function handleUnwatch(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const query = Object.fromEntries(new URL(request.url).searchParams)
    await unwatch(db, params.project, watcherSchema.parse(query))
    return new Response(null, { status: 204 })
  })
}
