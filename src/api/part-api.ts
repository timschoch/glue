// The HTTP API of the Part model: a Project, its Concepts, their Parts and
// the Joints between them. The server routes in src/routes/api/ reach these
// handlers through part-routes.ts. The schemas here document the answers
// in openapi.ts.
import { z } from 'zod'

import { frozenFields } from '../db/contracts.ts'
import { flightLevels, listLeveledParts } from '../db/flight-level.ts'
import { goalMeasureSchema } from '../db/goal-measure.ts'
import {
  addKind,
  kindChangeSchema,
  listKinds,
  newKindSchema,
  updateKind,
} from '../db/kinds.ts'
import type { Kind } from '../db/kinds.ts'
import { createPartOperations } from '../db/part-operations.ts'
import type { ChangedPart } from '../db/part-operations.ts'
import {
  addConcept,
  addJoint,
  conceptChangeSchema,
  newConceptSchema,
  newJointSchema,
  newPartSchema,
  partAnswerSchema,
  partChangeSchema,
  questionAnswerSchema,
  removeConcept,
  removeJoint,
  updateConcept,
} from '../db/part-records.ts'
import type { PartChange } from '../db/part-records.ts'
import {
  answers,
  activityKinds,
  evidenceLevels,
  findConcept,
  findProject,
  flagReasons,
  listMine,
  listParts,
  partTypes,
  slots,
  trusts,
  workStates,
} from '../db/parts.ts'
import type { Concept, Part, PartSummary, Project } from '../db/parts.ts'
import { ApiError, handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest, ChangeRequest } from './api-request.ts'

const partType = z.enum(partTypes)
const kind = z
  .string()
  .nullable()
  .meta({ description: 'The slug of its Kind. null: it has no Kind' })

export const kindSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    slots: z
      .array(
        z.object({
          type: partType,
          required: z.boolean().meta({
            description: 'A sign-off of a Concept of the Kind needs it filled',
          }),
          tier: z.union([z.literal(1), z.literal(2)]).meta({
            description:
              '1: what a coding agent reads (Flow, Entity, Guardrail). 2: the why',
          }),
          minCount: z.number().meta({
            description: 'The least count of Parts that fill the slot',
          }),
        }),
      )
      .meta({ description: 'One slot per Part type that the Kind has' }),
  })
  .meta({ id: 'Kind' }) satisfies z.ZodType<Kind>

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
    emptySlots: z.array(z.enum(slots)).meta({
      description:
        'What the Part needs and no Joint gives it. A Decision needs a Goal and evidence (an Insight or a Guardrail). A Flow and an Entity need a Decision. A solid Part with an empty slot has the trust flagged. No flag and no notice',
    }),
    reviewNotes: z
      .array(z.object({ id: z.string(), type: partType, title: z.string() }))
      .meta({
        description:
          'The Parts with the workState review that this Part needs. A note, not a flag: the trust stays',
      }),
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
    kinds: z.array(kindSchema).meta({
      description: 'The Kinds that a Concept of the Project can have',
    }),
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
    slots: z
      .array(
        z.object({
          type: partType,
          required: z.boolean(),
          filled: z.boolean(),
        }),
      )
      .meta({
        description:
          'One slot per Part type of the Kind. Empty when the Concept has no Kind. A slot is filled when the Concept, with the Concepts in it and the Parts that a Joint glues to them, has the least count of Parts of the type. A sign-off needs each required slot filled',
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

export const flowStepSchema = z
  .object({
    text: z.string(),
    entity: z.string().nullable().meta({
      description:
        'The record id of the Entity that the step works on. The Flow needs that Entity',
    }),
  })
  .meta({ id: 'FlowStep' })

export const entityFieldSchema = z
  .object({
    name: z.string(),
    meaning: z.string().meta({ description: 'What the field means' }),
  })
  .meta({ id: 'EntityField' })

const flagCauseSchema = z
  .object({ id: z.string(), title: z.string() })
  .meta({ description: 'The Part that caused the flag' })

const measuredPartSchema = z.object({
  ...partSummarySchema.shape,
  measure: partMeasureSchema.nullable(),
})

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
    evidenceBase: z.enum(evidenceLevels).nullable().meta({
      description:
        'The level of the strongest evidence of a Decision. A Guardrail counts as confirmed. A Decision on a hunch takes no sign-off. null: no Decision, or no evidence',
    }),
    steps: z.array(flowStepSchema).meta({
      description: 'The steps of a Flow, in order',
    }),
    fields: z.array(entityFieldSchema).meta({
      description: 'The fields of an Entity',
    }),
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
    measured: z.array(measuredPartSchema).meta({
      description:
        'The Metrics and the measured Goals at the other end of a Joint',
    }),
    goalMetrics: z.array(measuredPartSchema).meta({
      description:
        'Only a Decision has them: the Metrics at the other end of a Joint of a Goal that it needs',
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
            kind: z.enum(activityKinds).meta({
              description:
                'A step of the Work state, an edit (changed), a wording fix, or a step of the evidence level (raised, verified, disputed)',
            }),
            at: z.iso.datetime(),
            by: z.string().optional().meta({
              description: 'The name of the member who did it',
            }),
            version: z.number().optional().meta({
              description:
                'Only a sign-off has it: the number of the Part Version that it stored',
            }),
            note: z.string().optional().meta({
              description:
                'Only a step of the evidence level has it: what was tested, or why the Insight is in doubt',
            }),
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
    versions: z
      .array(
        z.object({
          version: z.number().meta({
            description: 'The number of the Version. It counts up per Part',
          }),
          title: z.string(),
          body: z.string(),
          status: z.string().nullable(),
          owner: z.string().nullable(),
          date: z.string().nullable(),
          source: z.string().nullable(),
          metric: z.string().nullable(),
          enforcedBy: z.string().nullable(),
          evidenceLevel: z.enum(evidenceLevels).nullable(),
          steps: z.array(flowStepSchema),
          fields: z.array(entityFieldSchema),
          signedAt: z.iso.datetime(),
          signedBy: z.string().nullable().meta({
            description: 'The name of the member who signed it off',
          }),
        }),
      )
      .meta({
        description:
          'The Versions of the Part, newest first: the Part as each sign-off froze it',
      }),
  })
  .meta({ id: 'Part' }) satisfies z.ZodType<Part>

// A Part after an add or a change. An accepted Decision opens its issue
// downstream. When GitHub fails, the change stays and `issueError` says why
// the issue is missing.
export const changedPartSchema = partSchema
  .extend({
    issueError: z.string().optional().meta({
      description:
        'Why the issue is missing. `pnpm concept downstream` opens it',
    }),
  })
  .meta({ id: 'ChangedPart' })

export const addedJointSchema = z.object({ id: z.number() })

export const conceptInputSchema = newConceptSchema.meta({ id: 'ConceptInput' })
export const conceptUpdateSchema = conceptChangeSchema.meta({
  id: 'ConceptUpdate',
  description: 'One field or more',
})
export const kindInputSchema = newKindSchema.meta({ id: 'KindInput' })
export const kindUpdateSchema = kindChangeSchema.meta({
  id: 'KindUpdate',
  description: 'One field or more',
})
export const partInputSchema = newPartSchema.meta({ id: 'PartInput' })
export const partUpdateSchema = partChangeSchema.meta({
  id: 'PartUpdate',
  description: 'One field or more, of the fields that the type of the Part has',
})
export const jointInputSchema = newJointSchema.meta({ id: 'JointInput' })
export const answerInputSchema = partAnswerSchema.meta({
  id: 'AnswerInput',
  description:
    'The answer of the owner. The Work state of the Part says which answers it takes. verify takes a Pattern to confirmed, and dispute takes a confirmed Insight back to pattern',
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

export function handleUpdateConcept(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { project, concept: slug = '' } = params
    if (!(await findConcept(db, project, slug)))
      throw toNotFound('concept', slug)
    const change = conceptChangeSchema.parse(await parseJson(request))
    await updateConcept(db, project, slug, change)
    return Response.json(await findConcept(db, project, slug))
  })
}

async function findKind(input: ApiRequest, slug: string) {
  const kinds = await listKinds(input.db, input.params.project)
  return kinds.find((found) => found.slug === slug)
}

export function handleListKinds(input: ApiRequest) {
  return handleApiRequest(input, async () =>
    Response.json(await listKinds(input.db, input.params.project)),
  )
}

export function handleAddKind(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const added = newKindSchema.parse(await parseJson(request))
    const slug = await addKind(db, params.project, added)
    return Response.json(await findKind(input, slug), { status: 201 })
  })
}

export function handleUpdateKind(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { project, kind: slug = '' } = params
    if (!(await findKind(input, slug))) throw toNotFound('kind', slug)
    const change = kindChangeSchema.parse(await parseJson(request))
    await updateKind(db, project, slug, change)
    return Response.json(await findKind(input, slug))
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
  return handleApiRequest(input, async (member) => {
    const part = newPartSchema.parse(await parseJson(input.request))
    const added = await createPartOperations(input).addPart(
      input.params.project,
      part,
      member?.email,
    )
    return toChangedPartResponse(added, 201)
  })
}

export function handleUpdatePart(input: ChangeRequest) {
  return handleApiRequest(input, async (member) => {
    const { project, recordId = '' } = input.params
    // The operation reads the change with the schema of the type of the Part.
    const change = (await parseJson(input.request)) as PartChange
    return toChangedPartResponse(
      await createPartOperations(input).updatePart(
        project,
        recordId,
        change,
        undefined,
        member?.email,
      ),
    )
  })
}

export function handleAnswerPart(input: ChangeRequest) {
  return handleApiRequest(input, async (member) => {
    const { project, recordId = '' } = input.params
    const answer = partAnswerSchema.parse(await parseJson(input.request))
    return toChangedPartResponse(
      await createPartOperations(input).answerPart(
        project,
        recordId,
        answer,
        member?.email,
      ),
    )
  })
}

export function handleAnswerQuestion(input: ChangeRequest) {
  return handleApiRequest(input, async (member) => {
    const { project, recordId = '' } = input.params
    const answer = questionAnswerSchema.parse(await parseJson(input.request))
    // The member of the token answers, when the request names nobody.
    return toChangedPartResponse(
      await createPartOperations(input).answerQuestion(
        project,
        recordId,
        { ...answer, by: answer.by ?? member?.name },
        member?.email,
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
