// The HTTP API of the Part model: a Project, its Concepts, their Parts and
// the Joints between them. The server routes in src/routes/api/ reach these
// handlers through part-routes.ts. The schemas here document the answers
// in openapi.ts.
import { z } from 'zod'

import { frozenFields } from '../db/contracts.ts'
import { flightLevels, listLeveledParts } from '../db/flight-level.ts'
import { goalMeasureSchema } from '../db/goal-measure.ts'
import { createPartOperations } from '../db/part-operations.ts'
import type { ChangedPart } from '../db/part-operations.ts'
import {
  addConcept,
  addJoint,
  newConceptSchema,
  newJointSchema,
  newPartSchema,
  partAnswerSchema,
  partChangeSchema,
  questionAnswerSchema,
  removeConcept,
  removeJoint,
} from '../db/part-records.ts'
import type { PartChange } from '../db/part-records.ts'
import {
  answers,
  evidenceLevels,
  findConcept,
  findProject,
  flagReasons,
  listMine,
  listParts,
  partTypes,
  trusts,
  workStates,
} from '../db/parts.ts'
import type { Concept, Part, PartSummary, Project } from '../db/parts.ts'
import { ApiError, handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest, ChangeRequest } from './api-request.ts'

const partType = z.enum(partTypes)
const kind = newConceptSchema.shape.kind.unwrap().nullable()

export const partSummarySchema = z
  .object({
    id: z.string().meta({ description: 'The record id, like D12' }),
    type: partType,
    title: z.string(),
    status: z.string().nullable(),
    trust: z.enum(trusts).meta({ description: 'Can you rely on the Part' }),
    workState: z
      .enum(workStates)
      .meta({ description: 'Whose move it is on the Part' }),
    concept: z.string().meta({ description: 'The slug of the home Concept' }),
    conceptTitle: z
      .string()
      .meta({ description: 'The title of the home Concept' }),
  })
  .meta({ id: 'PartSummary' }) satisfies z.ZodType<PartSummary>

// A Part in the list of a member.
export const leveledPartSchema = partSummarySchema
  .extend({
    flightLevel: z.enum(flightLevels).optional().meta({
      description:
        'Only with member. operational: the Part is of a loop step of the member, or the member is Responsible or Co-Author of the Part or of its home Concept. strategic: each other Part',
    }),
  })
  .meta({ id: 'LeveledPart' })

const conceptNodeSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    kind,
    partCount: z.number().meta({
      description:
        'The Parts with their home in this Concept or in a Concept in it',
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

const partMeasureSchema = z
  .object({
    measure: goalMeasureSchema,
    baseline: z.number().nullable(),
    latestValue: z.number().nullable().meta({
      description: 'The newest reading. null before the first measure run',
    }),
    latestBreakdownValue: z.string().nullable(),
    measuredAt: z.iso.datetime().nullable().meta({
      description: 'The time of the newest reading',
    }),
    target: z.number().nullable().meta({
      description:
        'The value to reach. null for a mean that has no baseline yet',
    }),
    onTarget: z.boolean().nullable().meta({
      description: 'null when there is no reading or no target',
    }),
  })
  .meta({ id: 'PartMeasure' })

const jointEndSchema = z
  .object({
    jointId: z.number(),
    twoWay: z.boolean(),
    link: z.boolean().meta({
      description: 'The two Parts have their home in different Concepts',
    }),
    contractVersion: z.number().nullable().meta({
      description:
        'The Contract Version of the Concept of the needed Part that the Joint was built with. null: the Joint is glued to the live Part',
    }),
    project: z.object({ slug: z.string(), name: z.string() }).optional().meta({
      description:
        'The Project of the Part at the other end. Only a reference has one: a Joint to a Part of another Project, written glue/D4',
    }),
    part: partSummarySchema.meta({ description: 'The Part at the other end' }),
  })
  .meta({ id: 'JointEnd' })

const flagCauseSchema = z
  .object({ id: z.string(), title: z.string() })
  .meta({ description: 'The Part that caused the flag' })

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
    question: z
      .object({
        options: z.array(z.string()),
        pick: z.number().nullable().meta({
          description: 'The option that the author would take, from 1',
        }),
        answer: z
          .object({
            option: z.number().nullable().meta({
              description: 'The option that the person chose, from 1',
            }),
            text: z.string().nullable(),
            by: z.string(),
            at: z.iso.datetime(),
          })
          .nullable(),
      })
      .nullable()
      .meta({
        description: 'What a Decision asks, and the answer that it got',
      }),
    unchosen: z.boolean().meta({
      description: 'A superseded Decision that was never accepted',
    }),
    measure: partMeasureSchema.nullable(),
    measured: z
      .array(
        z.object({
          ...partSummarySchema.shape,
          measure: partMeasureSchema.nullable(),
        }),
      )
      .meta({
        description:
          'The Metrics and the measured Goals at the other end of a Joint',
      }),
    supersededBy: partSummarySchema.nullable(),
    supersedes: z.array(partSummarySchema),
    needs: z.array(jointEndSchema).meta({
      description: 'A two-way Joint shows here on both sides',
    }),
    neededBy: z.array(jointEndSchema),
    flags: z
      .array(
        z.object({
          cause: flagCauseSchema,
          reason: z.enum(flagReasons),
          createdAt: z.iso.datetime(),
          contract: z
            .object({
              concept: z.string().meta({
                description: 'The slug of the Concept of the cause',
              }),
              builtWith: z.number().meta({
                description: 'The Contract Version that the Joint has',
              }),
              newest: z.number(),
              changes: z.array(
                z.object({
                  field: z.enum(frozenFields),
                  before: z.string().nullable(),
                  after: z.string().nullable(),
                }),
              ),
            })
            .optional()
            .meta({
              description:
                'Only a flag with the reason new-version has it: what the newest Contract Version changed in the cause. The answer move-to-version takes `newest`',
            }),
        }),
      )
      .meta({ description: 'The open flags, oldest first' }),
    waitsOn: partSummarySchema.nullable().meta({
      description: 'The Part that a waiting Part waits on',
    }),
    signals: z
      .array(z.object({ url: z.string(), title: z.string() }))
      .meta({ description: 'The Signals that an Insight grew from' }),
    answers: z.array(z.enum(answers)).meta({
      description: 'The answers that the Work state takes, the usual one first',
    }),
    activity: z
      .array(
        z.union([
          z.object({
            kind: z.enum(['changed', 'published']),
            at: z.iso.datetime(),
          }),
          z.object({
            kind: z.enum(['flag-opened', 'flag-closed']),
            at: z.iso.datetime(),
            cause: flagCauseSchema,
            reason: z.enum(flagReasons),
          }),
        ]),
      )
      .meta({ description: 'What happened to the Part, newest first' }),
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
export const answerInputSchema = partAnswerSchema.meta({
  id: 'AnswerInput',
  description:
    'The answer of the owner. The Work state of the Part says which answers it takes',
})
export const questionAnswerInputSchema = questionAnswerSchema.meta({
  id: 'QuestionAnswerInput',
  description:
    'The answer to the question of a proposed Decision: one of its options, or an answer in words',
})

export const partTypesQuerySchema = z.array(partType)

function toNotFound(name: string, id: string | undefined) {
  return new ApiError('not-found', `${name} "${id}" not found`)
}

// The answer to a write of a Part: the Part, and why its issue is missing.
export function toChangedPartResponse(
  { part, issue }: ChangedPart,
  status = 200,
) {
  return Response.json(
    issue.kind === 'failed' ? { ...part, issueError: issue.message } : part,
    { status },
  )
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

export function handleRemoveConcept(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { project, concept = '' } = input.params
    await removeConcept(input.db, project, concept)
    return new Response(null, { status: 204 })
  })
}

export function handleListParts(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { searchParams } = new URL(input.request.url)
    const found = partTypesQuerySchema.parse(searchParams.getAll('type'))
    const types = found.length > 0 ? found : undefined
    const member = searchParams.get('member')
    const { db, params } = input
    return Response.json(
      member === null
        ? await listParts(db, params.project, types)
        : await listLeveledParts(db, params.project, member, types),
    )
  })
}

export function handleGetPart(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { project, recordId = '' } = input.params
    const part = await createPartOperations(input).getPart(project, recordId)
    return Response.json(part)
  })
}

export function handleAddPart(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const part = newPartSchema.parse(await parseJson(input.request))
    const added = await createPartOperations(input).addPart(
      input.params.project,
      part,
    )
    return toChangedPartResponse(added, 201)
  })
}

export function handleUpdatePart(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { project, recordId = '' } = input.params
    // The operation reads the change with the schema of the type of the Part.
    const change = (await parseJson(input.request)) as PartChange
    return toChangedPartResponse(
      await createPartOperations(input).updatePart(project, recordId, change),
    )
  })
}

export function handleAnswerPart(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { project, recordId = '' } = input.params
    const answer = partAnswerSchema.parse(await parseJson(input.request))
    return toChangedPartResponse(
      await createPartOperations(input).answerPart(project, recordId, answer),
    )
  })
}

export function handleAnswerQuestion(input: ChangeRequest) {
  return handleApiRequest(input, async () => {
    const { project, recordId = '' } = input.params
    const answer = questionAnswerSchema.parse(await parseJson(input.request))
    return toChangedPartResponse(
      await createPartOperations(input).answerQuestion(
        project,
        recordId,
        answer,
      ),
    )
  })
}

export function handleListMine(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const member = new URL(input.request.url).searchParams.get('member')
    return Response.json(
      await listMine(input.db, input.params.project, member ?? undefined),
    )
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
