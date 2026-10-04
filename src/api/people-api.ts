// The people of a Project in the HTTP API: its members and their
// assignments. The handlers stay free of TanStack and of `process.env`, so
// a test calls them with a `Request` and a PGlite database.
import { z } from 'zod'

import {
  addMember,
  assign,
  assignmentRoles,
  assignmentTargetSchema,
  listAssignments,
  listMembers,
  loopSteps,
  newAssignmentSchema,
  unassign,
} from '../db/members.ts'
import { handleApiRequest, parseJson } from './concept-api.ts'
import type { ApiRequest } from './concept-api.ts'

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
