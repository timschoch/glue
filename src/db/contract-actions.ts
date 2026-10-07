import { z } from 'zod'

import {
  answerContractQuestion,
  askContractQuestion,
  listContractQuestions,
  listMineContractQuestions,
} from './contract-questions.ts'
import { findContract, findContractState, signContract } from './contracts.ts'
import { createSessionGuard, toFailure } from './session-actions.ts'
import type { ActionRequest } from './session-actions.ts'

// The input of the server functions of the Contract.
export const contractStateInputSchema = z.object({
  project: z.string(),
  concept: z.string(),
})

export const contractReadInputSchema = contractStateInputSchema.extend({
  version: z.int().positive().optional(),
})

export const mineContractQuestionsInputSchema = z.object({
  project: z.string(),
})

export const contractQuestionAskInputSchema = contractStateInputSchema.extend({
  text: z.string(),
})

export const contractQuestionAnswerInputSchema = z.object({
  project: z.string(),
  questionId: z.int().positive(),
  text: z.string(),
})

export type ContractQuestionAskInput = z.infer<
  typeof contractQuestionAskInputSchema
>
export type ContractQuestionAnswerInput = z.infer<
  typeof contractQuestionAnswerInputSchema
>

type ContractStateInput = z.infer<typeof contractStateInputSchema>
type ContractReadInput = z.infer<typeof contractReadInputSchema>

// What the server functions of the Contract do. Each action looks for the
// session first. A member of the Project signs, asks and answers.
export function createContractActions(
  request: Pick<ActionRequest, 'findSession' | 'getDb'>,
) {
  const { withSession, withReader, withMember } = createSessionGuard(request)

  return {
    findContractState: withSession(
      (db, { project, concept }: ContractStateInput) =>
        findContractState(db, project, concept),
    ),

    findContract: withSession(
      (db, { project, concept, version }: ContractReadInput) =>
        findContract(db, project, concept, version),
    ),

    signContract: withMember(
      (db, { project, concept }: ContractStateInput, member) =>
        signContract(db, project, concept, member.name).then(
          (version) => ({ version }),
          toFailure,
        ),
    ),

    listContractQuestions: withSession(
      (db, { project, concept }: ContractStateInput) =>
        listContractQuestions(db, project, concept),
    ),

    // The open questions that the member answers. A person who is no member
    // answers none.
    listMineContractQuestions: withReader(
      (db, { project }: { project: string }, member) =>
        member
          ? listMineContractQuestions(db, project, member.email)
          : Promise.resolve([]),
    ),

    // The member asks about the newest Contract Version of the Concept.
    askContractQuestion: withMember(
      (db, { project, concept, text }: ContractQuestionAskInput, member) =>
        askContractQuestion(db, project, concept, {
          text,
          askedBy: member.name,
        }).then(({ id }) => ({ id }), toFailure),
    ),

    answerContractQuestion: withMember(
      (
        db,
        { project, questionId, text }: ContractQuestionAnswerInput,
        member,
      ) =>
        answerContractQuestion(db, project, questionId, {
          text,
          answeredBy: member.name,
        }).then(({ id }) => ({ id }), toFailure),
    ),
  }
}
