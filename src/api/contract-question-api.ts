// The questions about a Contract Version in the HTTP API (glue/D62): a
// builder asks about the Version that it builds with, and the member who is
// Responsible for the Concept answers. The schemas here document the
// answers in openapi.ts.
import { z } from 'zod'

import {
  answerContractQuestion,
  askContractQuestion,
  contractQuestionAnswerSchema,
  listContractQuestions,
  listMineContractQuestions,
  newContractQuestionSchema,
} from '../db/contract-questions.ts'
import type { ContractQuestion } from '../db/contract-questions.ts'
import { ApiError, handleApiRequest, parseJson } from './api-request.ts'
import type { ApiRequest } from './api-request.ts'

export const contractQuestionSchema = z
  .object({
    id: z.number(),
    concept: z.string().meta({ description: 'The slug of the Concept' }),
    conceptTitle: z.string(),
    version: z.number().meta({
      description: 'The Contract Version that the builder asked about',
    }),
    stale: z.boolean().meta({
      description: 'The Concept has a newer Contract Version',
    }),
    text: z.string(),
    askedBy: z.string().meta({
      description: 'The name of who asked: a member, or the agent of a token',
    }),
    askedAt: z.iso.datetime(),
    answer: z
      .object({ text: z.string(), by: z.string(), at: z.iso.datetime() })
      .nullable()
      .meta({ description: 'null: the question is open' }),
  })
  .meta({ id: 'ContractQuestion' }) satisfies z.ZodType<ContractQuestion>

export const contractQuestionInputSchema = newContractQuestionSchema.meta({
  id: 'ContractQuestionInput',
})

export const contractQuestionAnswerInputSchema =
  contractQuestionAnswerSchema.meta({ id: 'ContractQuestionAnswerInput' })

export function handleListContractQuestions(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { project, concept = '' } = input.params
    return Response.json(
      await listContractQuestions(input.db, project, concept),
    )
  })
}

export function handleAskContractQuestion(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const question = contractQuestionInputSchema.parse(await parseJson(request))
    return Response.json(
      await askContractQuestion(
        db,
        params.project,
        params.concept ?? '',
        question,
      ),
      { status: 201 },
    )
  })
}

export function handleListMineContractQuestions(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const member = new URL(input.request.url).searchParams.get('member')
    return Response.json(
      await listMineContractQuestions(
        input.db,
        input.params.project,
        member ?? undefined,
      ),
    )
  })
}

const QUESTION_ID = /^\d+$/

export function handleAnswerContractQuestion(input: ApiRequest) {
  return handleApiRequest(input, async () => {
    const { db, request, params } = input
    const { questionId = '' } = params
    if (!QUESTION_ID.test(questionId))
      throw new ApiError('not-found', `question ${questionId} not found`)
    const answer = contractQuestionAnswerInputSchema.parse(
      await parseJson(request),
    )
    return Response.json(
      await answerContractQuestion(
        db,
        params.project,
        Number(questionId),
        answer,
      ),
    )
  })
}
