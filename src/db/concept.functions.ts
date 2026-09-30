import { createServerFn } from '@tanstack/react-start'

import {
  getAuthenticationServer,
  getRequestCookies,
} from '../authentication/neon-auth.server.ts'
import { findSession } from '../authentication/session.ts'
import { getSetting } from '../settings.server.ts'
import { createGithubClient } from '../github/client.ts'
import { createDb } from './client.ts'
import {
  createConceptActions,
  goalUpdateInputSchema,
} from './concept-actions.ts'
import {
  productInputSchema,
  proposalInputSchema,
  recordInputSchema,
} from './decision-proposal.ts'

// The validators parse the input. Each action looks for the session itself.
const actions = createConceptActions({
  findSession: () =>
    findSession(getAuthenticationServer(), getRequestCookies()),
  getDb: () => createDb(getSetting('DATABASE_URL')),
  getGithub: createGithubClient,
})

export const fetchProducts = createServerFn({ method: 'GET' }).handler(() =>
  actions.listProducts(),
)

export const fetchConcept = createServerFn({ method: 'GET' })
  .validator(productInputSchema)
  .handler(({ data }) => actions.findConcept(data))

export const fetchRecord = createServerFn({ method: 'GET' })
  .validator(recordInputSchema)
  .handler(({ data }) => actions.findRecord(data))

export const submitKeepInsight = createServerFn({ method: 'POST' })
  .validator(recordInputSchema)
  .handler(({ data }) => actions.keepInsight(data))

export const submitDiscardInsight = createServerFn({ method: 'POST' })
  .validator(recordInputSchema)
  .handler(({ data }) => actions.discardInsight(data))

export const submitAcceptDecision = createServerFn({ method: 'POST' })
  .validator(recordInputSchema)
  .handler(({ data }) => actions.acceptDecision(data))

export const submitUpdateGoal = createServerFn({ method: 'POST' })
  .validator(goalUpdateInputSchema)
  .handler(({ data }) => actions.updateGoal(data))

export const submitProposeDecision = createServerFn({ method: 'POST' })
  .validator(proposalInputSchema)
  .handler(({ data }) => actions.proposeDecision(data))
