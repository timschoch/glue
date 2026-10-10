import { isRedirect, redirect } from '@tanstack/react-router'

import { parseRedirect } from './authentication/redirect.ts'
import type { Session } from './authentication/session.ts'
import { UNKNOWN_CONCEPT } from './project/project-search.ts'
import { toWrite } from './project/use-write.ts'
import type { Write } from './project/use-write.ts'
import type { Server } from './router-server.ts'

// The session that a router read before. One per router: on the server a
// router serves one request, so a session never reaches another person.
export type SessionMemory = { session?: Session }

// Mine is open, so the person saw the new flags. No person starts this
// write, and no screen shows it.
const UNSHOWN = 'setFlagsSeen'

type ReadName = Extract<keyof Server, `fetch${string}` | typeof UNSHOWN>

// Each write of the server as a write that did not start yet: a screen
// starts it with `useWrite`.
type Writes = {
  [TName in Exclude<keyof Server, ReadName>]: Server[TName] extends (
    ...input: infer TInput
  ) => Promise<infer TDone>
    ? (...input: TInput) => Write<TDone>
    : never
}

export type RouterContext = Pick<Server, ReadName> &
  Writes & {
    // The session from the memory. Asks the server only when the memory is
    // empty.
    findSession: () => Promise<Session | undefined>
  }

function toWrites(server: Server): Writes {
  const sends: Record<string, (...input: Array<never>) => Promise<unknown>> =
    server
  // The names decide: the type `Writes` reads the same names.
  return Object.fromEntries(
    Object.entries(sends)
      .filter(([name]) => !name.startsWith('fetch') && name !== UNSHOWN)
      .map(([name, send]) => [
        name,
        (...input: Array<never>) => toWrite(() => send(...input)),
      ]),
  ) as Writes
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
    ...toWrites(server),
    fetchProject: (project) =>
      keepSignInTarget(server.fetchProject(project), `/${project}`),
    fetchParts: (project) =>
      keepSignInTarget(server.fetchParts(project), `/${project}`),
    fetchMine: (project) =>
      keepSignInTarget(server.fetchMine(project), `/${project}`),
    fetchNewFlagCount: (project) =>
      keepSignInTarget(server.fetchNewFlagCount(project), `/${project}`),
    fetchWatched: (project) =>
      keepSignInTarget(server.fetchWatched(project), `/${project}`),
    fetchMeasured: (project) =>
      keepSignInTarget(server.fetchMeasured(project), `/${project}`),
    fetchMapJoints: (project) =>
      keepSignInTarget(server.fetchMapJoints(project), `/${project}`),
    fetchPeople: (project) =>
      keepSignInTarget(server.fetchPeople(project), `/${project}`),
    fetchMineAsks: (project) =>
      keepSignInTarget(server.fetchMineAsks(project), `/${project}`),
    fetchAskState: (part) =>
      keepSignInTarget(
        server.fetchAskState(part),
        `/${part.project}/${UNKNOWN_CONCEPT}/${part.recordId}`,
      ),
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
    fetchContractQuestions: (concept) =>
      keepSignInTarget(
        server.fetchContractQuestions(concept),
        conceptPath(concept),
      ),
    fetchMineContractQuestions: (project) =>
      keepSignInTarget(
        server.fetchMineContractQuestions(project),
        `/${project}`,
      ),
    fetchSignals: (project) =>
      keepSignInTarget(server.fetchSignals(project), `/${project}`),
    fetchSignalFilters: (project) =>
      keepSignInTarget(server.fetchSignalFilters(project), `/${project}`),
    fetchIntegrations: (project) =>
      keepSignInTarget(server.fetchIntegrations(project), `/${project}`),
    fetchBuilds: (...read) =>
      keepSignInTarget(server.fetchBuilds(...read), `/${read[0]}`),
    // The record route sends the record to its home Concept.
    fetchPart: (part) =>
      keepSignInTarget(
        server.fetchPart(part),
        `/${part.project}/${UNKNOWN_CONCEPT}/${part.recordId}`,
      ),
    findSession: async () => (memory.session ??= await server.fetchSession()),
    signIn: (credentials) =>
      toWrite(() => {
        forgetSession()
        return server.signIn(credentials)
      }),
    signUp: (account) =>
      toWrite(() => {
        forgetSession()
        return server.signUp(account)
      }),
    signOut: () =>
      toWrite(() => {
        forgetSession()
        return server.signOut()
      }),
  }
}
