import { createServerFn } from '@tanstack/react-start'

import {
  getAuthenticationServer,
  getRequestCookies,
} from '../authentication/neon-auth.server.ts'
import { findSession } from '../authentication/session.ts'
import { getSetting } from '../settings.server.ts'
import { createDb } from './client.ts'
import {
  contractQuestionAnswerInputSchema,
  contractQuestionAskInputSchema,
  contractReadInputSchema,
  contractStateInputSchema,
  createContractActions,
  mineContractQuestionsInputSchema,
} from './contract-actions.ts'

// The server functions of the Contract. The validators parse the input.
// Each action looks for the session itself.
const actions = createContractActions({
  findSession: () =>
    findSession(getAuthenticationServer(), getRequestCookies()),
  getDb: () => createDb(getSetting('DATABASE_URL')),
})

export const fetchContractState = createServerFn({ method: 'GET' })
  .validator(contractStateInputSchema)
  .handler(({ data }) => actions.findContractState(data))

export const fetchContract = createServerFn({ method: 'GET' })
  .validator(contractReadInputSchema)
  .handler(({ data }) => actions.findContract(data))

export const submitSignContract = createServerFn({ method: 'POST' })
  .validator(contractStateInputSchema)
  .handler(({ data }) => actions.signContract(data))

export const fetchContractQuestions = createServerFn({ method: 'GET' })
  .validator(contractStateInputSchema)
  .handler(({ data }) => actions.listContractQuestions(data))

export const fetchMineContractQuestions = createServerFn({ method: 'GET' })
  .validator(mineContractQuestionsInputSchema)
  .handler(({ data }) => actions.listMineContractQuestions(data))

export const submitAskContractQuestion = createServerFn({ method: 'POST' })
  .validator(contractQuestionAskInputSchema)
  .handler(({ data }) => actions.askContractQuestion(data))

export const submitAnswerContractQuestion = createServerFn({ method: 'POST' })
  .validator(contractQuestionAnswerInputSchema)
  .handler(({ data }) => actions.answerContractQuestion(data))
