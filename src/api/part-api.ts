// The HTTP API of the Part model: a Project, its Concepts, their Parts and
// the Joints between them. The server routes in src/routes/api/ reach these
// handlers through concept-routes.ts. The schemas here document the answers
// in openapi.ts.
import { z } from 'zod'

import { goalMeasureSchema } from '../db/goal-measure.ts'
import {
  addConcept,
  addJoint,
  addPart,
  newConceptSchema,
  newJointSchema,
  newPartSchema,
  parsePartChange,
  partChangeSchema,
  removeJoint,
  updatePart,
} from '../db/part-records.ts'
import {
  evidenceLevels,
  findConcept,
  findPart,
  findProject,
  listParts,
  partTypes,
} from '../db/parts.ts'
import type { Concept, Part, PartSummary, Project } from '../db/parts.ts'
import { createDownstreamIssue } from '../github/downstream-issue.ts'
import { ApiError, handleApiRequest, parseJson } from './concept-api.ts'
import type { ApiRequest, ChangeRequest } from './concept-api.ts'

const partType = z.enum(partTypes)
const kind = newConceptSchema.shape.kind.unwrap().nullable()

export const partSummarySchema = z
  .object({
    id: z.string().meta({ description: 'The record id, like D12' }),
    type: partType,
    title: z.string(),
    status: z.string().nullable(),
    concept: z.string().meta({ description: 'The slug of the home Concept' }),
  })
  .meta({ id: 'PartSummary' }) satisfies z.ZodType<PartSummary>

const conceptNodeSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    kind,
    partCount: z.number().meta({
      description:
        'The Parts with their home in this Concept, without the Parts of the Concepts in it',
    }),
    get concepts() {
      return z.array(conceptNodeSchema)
    },
  })
  .meta({ id: 'ConceptNode' })

export const projectSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    concept: conceptNodeSchema.meta({ description: 'The root Concept' }),
  })
  .meta({ id: 'Project' }) satisfies z.ZodType<Project>

// The id `Concept` names the Concept of the folders, so this one says where
// it is.
export const projectConceptSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    kind,
    path: z
      .array(z.object({ slug: z.string(), title: z.string() }))
      .meta({ description: 'The Concepts that hold this one, root first' }),
    concepts: z.array(conceptNodeSchema),
    parts: z
      .array(partSummarySchema)
      .meta({ description: 'The Parts that have their home here' }),
    linkedParts: z.array(partSummarySchema).meta({
      description:
        'The Parts with a home elsewhere that a link glues to a Part of this Concept',
    }),
    joints: z.array(
      z.object({
        id: z.number(),
        part: z.string(),
        needs: z.string(),
        twoWay: z.boolean(),
        link: z.boolean(),
      }),
    ),
    slots: z.array(z.object({ type: partType, filled: z.boolean() })).meta({
      description:
        'One slot per Part type of the Kind. Empty when the Concept has no Kind',
    }),
  })
  .meta({ id: 'ProjectConcept' }) satisfies z.ZodType<Concept>

const jointEndSchema = z
  .object({
    jointId: z.number(),
    twoWay: z.boolean(),
    link: z.boolean().meta({
      description: 'The two Parts have their home in different Concepts',
    }),
    part: partSummarySchema.meta({ description: 'The Part at the other end' }),
  })
  .meta({ id: 'JointEnd' })

export const partSchema = z
  .object({
    ...partSummarySchema.shape,
    body: z.string(),
    owner: z.string().nullable(),
    date: z.iso.date().nullable(),
    source: z.string().nullable(),
    metric: z.string().nullable(),
    enforcedBy: z.string().nullable(),
    evidenceLevel: z.enum(evidenceLevels).nullable(),
    issueUrl: z.string().nullable(),
    measure: z
      .object({
        measure: goalMeasureSchema,
        baseline: z.number().nullable(),
        latestValue: z.number().nullable(),
        latestBreakdownValue: z.string().nullable(),
        measuredAt: z.iso.datetime().nullable(),
      })
      .nullable(),
    supersededBy: partSummarySchema.nullable(),
    supersedes: z.array(partSummarySchema),
    needs: z.array(jointEndSchema).meta({
      description: 'A two-way Joint shows here on both sides',
    }),
    neededBy: z.array(jointEndSchema),
  })
  .meta({ id: 'Part' }) satisfies z.ZodType<Part>

// A Part after an add or a change. An accepted Decision opens its issue
// downstream. When GitHub fails, the change stays and `issueError` says why
// the issue is missing.
export const changedPartSchema = partSchema
  .extend({
    issueError: z.string().optional().meta({
      description:
        'Why the issue is missing. The next status change or `pnpm concept downstream` opens it',
    }),
  })
  .meta({ id: 'ChangedPart' })

export const addedJointSchema = z.object({ id: z.number() })

export const conceptInputSchema = newConceptSchema.meta({ id: 'ConceptInput' })
export const partInputSchema = newPartSchema.meta({ id: 'PartInput' })
export const partUpdateSchema = partChangeSchema.meta({
  id: 'PartUpdate',
  description: 'One field or more, of the fields that the type of the Part has',
})
export const jointInputSchema = newJointSchema.meta({ id: 'JointInput' })

export const partTypesQuerySchema = z.array(partType)

function toNotFound(name: string, id: string | undefined) {
  return new ApiError('not-found', `${name} "${id}" not found`)
}

async function getPart({ db, params }: ApiRequest) {
  const { project, recordId = '' } = params
  const part = await findPart(db, project, recordId)
  if (!part) throw toNotFound('part', recordId)
  return part
}

// The Part after a write, with what became of its downstream issue.
async function findChangedPart(
  { db, github, params }: ChangeRequest,
  recordId: string,
) {
  const issue = await createDownstreamIssue(
    db,
    github,
    params.project,
    recordId,
  )
  const part = await findPart(db, params.project, recordId)
  return issue.kind === 'failed' ? { ...part, issueError: issue.message } : part
}

export function handleGetProject(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const project = await findProject(input.db, input.params.project)
    if (!project) throw toNotFound('project', input.params.project)
    return Response.json(project)
  })
}

export function handleGetProjectConcept(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { project, concept: slug = '' } = input.params
    const concept = await findConcept(input.db, project, slug)
    if (!concept) throw toNotFound('concept', slug)
    return Response.json(concept)
  })
}

export function handleAddConcept(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const concept = newConceptSchema.parse(await parseJson(request))
    const slug = await addConcept(db, params.project, concept)
    return Response.json(await findConcept(db, params.project, slug), {
      status: 201,
    })
  })
}

export function handleListParts(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { searchParams } = new URL(input.request.url)
    const types = partTypesQuerySchema.parse(searchParams.getAll('type'))
    return Response.json(
      await listParts(
        input.db,
        input.params.project,
        types.length > 0 ? types : undefined,
      ),
    )
  })
}

export function handleGetPart(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await getPart(input)),
  )
}

export function handleAddPart(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const part = newPartSchema.parse(await parseJson(request))
    const recordId = await addPart(db, params.project, part)
    return Response.json(await findChangedPart(input, recordId), {
      status: 201,
    })
  })
}

export function handleUpdatePart(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const part = await getPart(input)
    const change = parsePartChange(part.type, await parseJson(request))
    await updatePart(db, params.project, part.id, change)
    return Response.json(await findChangedPart(input, part.id))
  })
}

export function handleAddJoint(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const joint = newJointSchema.parse(await parseJson(request))
    const id = await addJoint(db, params.project, joint)
    return Response.json({ id }, { status: 201 })
  })
}

const JOINT_ID = /^\d+$/

export function handleRemoveJoint(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, params } = input
    const { jointId = '' } = params
    if (!JOINT_ID.test(jointId)) {
      throw new ApiError('not-found', `joint ${jointId} not found`)
    }
    await removeJoint(db, params.project, Number(jointId))
    return new Response(null, { status: 204 })
  })
}
