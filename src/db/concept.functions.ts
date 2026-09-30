import { createServerFn } from '@tanstack/react-start'

import {
  getAuthenticationServer,
  getRequestCookies,
} from '../authentication/neon-auth.server.ts'
import { findSession } from '../authentication/session.ts'
import { getSetting } from '../settings.server.ts'
import { createDb } from './client.ts'
import { createConceptActions } from './concept-actions.ts'
import type { ProposalInput, RecordInput } from './concept-actions.ts'

// Each action looks for the session and parses its input itself.
// The validators here only give the input its type.
const actions = createConceptActions({
  findSession: () =>
    findSession(getAuthenticationServer(), getRequestCookies()),
  getDb: () => createDb(getSetting('DATABASE_URL')),
})

export const fetchProducts = createServerFn({ method: 'GET' }).handler(() =>
  actions.listProducts(undefined),
)

export const fetchConcept = createServerFn({ method: 'GET' })
  .validator((product: string) => product)
  .handler(({ data }) => actions.findConcept(data))

export const fetchRecord = createServerFn({ method: 'GET' })
  .validator((input: RecordInput) => input)
  .handler(({ data }) => actions.findRecord(data))

export const submitKeepInsight = createServerFn({ method: 'POST' })
  .validator((input: RecordInput) => input)
  .handler(({ data }) => actions.keepInsight(data))

export const submitDiscardInsight = createServerFn({ method: 'POST' })
  .validator((input: RecordInput) => input)
  .handler(({ data }) => actions.discardInsight(data))

export const submitAcceptDecision = createServerFn({ method: 'POST' })
  .validator((input: RecordInput) => input)
  .handler(({ data }) => actions.acceptDecision(data))

export const submitDecision = createServerFn({ method: 'POST' })
  .validator((input: ProposalInput) => input)
  .handler(({ data }) => actions.proposeDecision(data))
