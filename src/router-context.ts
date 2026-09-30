import { isRedirect, redirect } from '@tanstack/react-router'

import type { SignIn, SignUp } from './authentication/credentials.ts'
import { parseRedirect } from './authentication/redirect.ts'
import type { Failure, Session } from './authentication/session.ts'
import type { SavedDecision } from './db/concept-actions.ts'
import type { ProposalInput, RecordInput } from './db/decision-proposal.ts'
import type { Concept, LinkedRecord, Product } from './db/concept.ts'

// What the routes need from the server. A test gives the router its own.
export type Server = {
  fetchSession: () => Promise<Session | undefined>
  fetchProducts: () => Promise<Product[]>
  fetchConcept: (product: string) => Promise<Concept | undefined>
  fetchRecord: (record: RecordInput) => Promise<LinkedRecord | undefined>
  keepInsight: (insight: RecordInput) => Promise<Failure | undefined>
  discardInsight: (insight: RecordInput) => Promise<Failure | undefined>
  acceptDecision: (decision: RecordInput) => Promise<SavedDecision | Failure>
  proposeDecision: (proposal: ProposalInput) => Promise<SavedDecision | Failure>
  signIn: (credentials: SignIn) => Promise<Failure | undefined>
  signUp: (account: SignUp) => Promise<Failure | undefined>
  signOut: () => Promise<void>
}

// The session that a router read before. One per router: on the server a
// router serves one request, so a session never reaches another person.
export type SessionMemory = { session?: Session }

export type RouterContext = Server & {
  // The session from the memory. Asks the server only when the memory is empty.
  findSession: () => Promise<Session | undefined>
}

// The pages behind sign-in read the session from the memory, so a navigation
// does not wait for the session and does not fail with it. A sign-in, a
// sign-up and a sign-out empty the memory. The server functions that read
// the Concept look for the session themselves on each request.
// A server function sends an expired session to sign-in without the page
// to return to afterwards. Attach it here, where the path is known.
async function keepSignInTarget<TResult>(
  promise: Promise<TResult>,
  path: string,
): Promise<TResult> {
  try {
    return await promise
  } catch (error) {
    if (isRedirect(error) && error.options.to === '/sign-in') {
      throw redirect({
        to: '/sign-in',
        search: { redirect: parseRedirect(path) },
      })
    }
    throw error
  }
}

export function createRouterContext(
  server: Server,
  memory: SessionMemory = {},
): RouterContext {
  function forgetSession() {
    memory.session = undefined
  }

  return {
    ...server,
    fetchConcept: (product) =>
      keepSignInTarget(server.fetchConcept(product), `/${product}`),
    fetchRecord: (record) =>
      keepSignInTarget(
        server.fetchRecord(record),
        `/${record.product}/concept/${record.recordId}`,
      ),
    findSession: async () => (memory.session ??= await server.fetchSession()),
    signIn: (credentials) => {
      forgetSession()
      return server.signIn(credentials)
    },
    signUp: (account) => {
      forgetSession()
      return server.signUp(account)
    },
    signOut: () => {
      forgetSession()
      return server.signOut()
    },
  }
}
