// Ask another team in the HTTP API (glue/D51, glue/D56): a Project asks
// another one to check a Hunch or for a Decision, a member of that Project
// picks the Ask and hands back an Insight or a Decision. The handlers stay
// free of TanStack and of `process.env`, so a test calls them with a
// `Request` and a PGlite database.
import { z } from 'zod'

import {
  addAsk,
  askKinds,
  handBackAsk,
  listMineAsks,
  newAskSchema,
  pickAsk,
  takeBackAsk,
} from '../db/asks.ts'
import type { Ask } from '../db/asks.ts'
import { trusts } from '../db/parts.ts'
import { partTypes } from '../db/schema.ts'
import { ApiError, handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

const projectSchema = z.object({ slug: z.string(), name: z.string() })

const memberSchema = z.object({ name: z.string(), email: z.string() })

const askPartSchema = z.object({
  project: projectSchema,
  id: z.string().meta({ description: 'The record id, like I12' }),
  type: z.enum(partTypes),
  title: z.string(),
  trust: z.enum(trusts).meta({ description: 'Can you rely on the Part' }),
  concept: z.string().meta({ description: 'The slug of the home Concept' }),
})

export const askSchema = z
  .object({
    id: z.number(),
    kind: z.enum(askKinds).meta({
      description:
        'What the Ask asks for. insight: the check of a Hunch. decision: a Decision',
    }),
    step: z.enum(['pick', 'hand-back', 'check']).meta({
      description:
        'What the Ask waits for. pick: a member of the asked Project. hand-back: the Insight or the Decision of that member. A Decision that is handed back ends the Ask: Glue adds the Joint. check: the Project that asked glues the Insight to the Hunch with a Joint, and the Ask is done',
    }),
    part: askPartSchema.meta({
      description: 'The Part that waits for the answer',
    }),
    project: projectSchema.meta({ description: 'The Project that is asked' }),
    question: z.string().nullable(),
    askedBy: memberSchema.nullable().meta({
      description:
        'The member who made the Ask. Only this member takes it back',
    }),
    pickedBy: memberSchema.nullable(),
    handedBack: askPartSchema.nullable().meta({
      description: 'The Part of the asked Project that was handed back',
    }),
    askedAt: z.iso.datetime(),
  })
  .meta({ id: 'Ask' }) satisfies z.ZodType<Ask>

export const addedAskSchema = z.object({ id: z.number() })

export const askInputSchema = newAskSchema
  .extend({
    askedBy: z.string().trim().min(1).optional().meta({
      description:
        'The e-mail address of the member of this Project who asks. Only this member takes the Ask back',
    }),
  })
  .meta({ id: 'AskInput' })

// The next step of an Ask, as the asked Project takes it.
export const askStepInputSchema = z
  .union([
    z.strictObject({
      pickedBy: z.string().trim().min(1).meta({
        description:
          'Pick: the e-mail address of the member of the asked Project',
      }),
    }),
    z.strictObject({
      insight: z.string().meta({
        description:
          'Hand back to an Ask for an Insight: the record id of a published Insight of the asked Project',
      }),
    }),
    z.strictObject({
      decision: z.string().meta({
        description:
          'Hand back to an Ask for a Decision: the record id of a published Decision of the asked Project',
      }),
    }),
  ])
  .meta({ id: 'AskStepInput' })

export function handleListAsks(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const member = new URL(input.request.url).searchParams.get('member')
    return Response.json(
      await listMineAsks(input.db, input.params.project, member ?? undefined),
    )
  })
}

export function handleAddAsk(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { askedBy, ...ask } = askInputSchema.parse(await parseJson(request))
    const id = await addAsk(db, params.project, ask, askedBy)
    return Response.json({ id }, { status: 201 })
  })
}

const ASK_ID = /^\d+$/

// The id of the Ask in the path.
function parseAskId({ askId = '' }: ApiRequest['params']): number {
  if (!ASK_ID.test(askId)) {
    throw new ApiError('not-found', `ask ${askId} not found`)
  }
  return Number(askId)
}

export function handleUpdateAsk(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const askId = parseAskId(params)
    const step = askStepInputSchema.parse(await parseJson(request))
    if ('pickedBy' in step) {
      await pickAsk(db, params.project, askId, step.pickedBy)
    } else {
      const recordId = 'insight' in step ? step.insight : step.decision
      await handBackAsk(db, params.project, askId, recordId)
    }
    return new Response(null, { status: 204 })
  })
}

export const askTakeBackQuerySchema = z.object({
  member: z.string().trim().min(1).meta({
    description:
      'The e-mail address of the member who asked. An Ask that names no such member: a member who has the Part that waits, or each member when nobody has it',
  }),
})

// The member who asked takes the Ask back.
export function handleRemoveAsk(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const askId = parseAskId(params)
    const { member } = askTakeBackQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    await takeBackAsk(db, params.project, askId, member)
    return new Response(null, { status: 204 })
  })
}
