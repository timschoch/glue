import { isRedirect, redirect } from '@tanstack/react-router'

import { parseRedirect } from './authentication/redirect.ts'
import type { Session } from './authentication/session.ts'
import { UNKNOWN_CONCEPT } from './project/project-search.ts'
import type { Server } from './router-server.ts'

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
// the Project look for the session themselves on each request.
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

// The guard of each route that needs a session. It is for the pages: the
// server functions that read the Project check the session themselves. So
// the guard asks the server once.
export async function requireSession(context: RouterContext, path: string) {
  const session = await context.findSession()
  if (!session) {
    throw redirect({
      to: '/sign-in',
      search: { redirect: parseRedirect(path) },
    })
  }
  return { session }
}

function conceptPath({
  project,
  concept,
}: {
  project: string
  concept: string
}) {
  return concept === project ? `/${project}` : `/${project}/${concept}`
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
    fetchProject: (project) =>
      keepSignInTarget(server.fetchProject(project), `/${project}`),
    fetchParts: (project) =>
      keepSignInTarget(server.fetchParts(project), `/${project}`),
    fetchMine: (project) =>
      keepSignInTarget(server.fetchMine(project), `/${project}`),
    fetchWatched: (project) =>
      keepSignInTarget(server.fetchWatched(project), `/${project}`),
    fetchMeasured: (project) =>
      keepSignInTarget(server.fetchMeasured(project), `/${project}`),
    fetchMapJoints: (project) =>
      keepSignInTarget(server.fetchMapJoints(project), `/${project}`),
    fetchPeople: (project) =>
      keepSignInTarget(server.fetchPeople(project), `/${project}`),
    fetchConcept: (concept) =>
      keepSignInTarget(server.fetchConcept(concept), conceptPath(concept)),
    fetchContractState: (concept) =>
      keepSignInTarget(
        server.fetchContractState(concept),
        conceptPath(concept),
      ),
    fetchContract: (contract) =>
      keepSignInTarget(
        server.fetchContract(contract),
        `/${contract.project}/${contract.concept}/contract/${contract.version}`,
      ),
    fetchSignals: (project) =>
      keepSignInTarget(server.fetchSignals(project), `/${project}`),
    fetchBuilds: (...read) =>
      keepSignInTarget(server.fetchBuilds(...read), `/${read[0]}`),
    // The record route sends the record to its home Concept.
    fetchPart: (part) =>
      keepSignInTarget(
        server.fetchPart(part),
        `/${part.project}/${UNKNOWN_CONCEPT}/${part.recordId}`,
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
