import { isRedirect, redirect } from '@tanstack/react-router'

import type { SignIn, SignUp } from './authentication/credentials.ts'
import { parseRedirect } from './authentication/redirect.ts'
import type { Failure, Session } from './authentication/session.ts'
import type {
  AnswerInput,
  ConceptAddInput,
  JointAddInput,
  JointRemoveInput,
  PartAddInput,
  PartUpdateInput,
  ProjectAddInput,
  SavedPart,
} from './db/part-actions.ts'
import type { Concept, Part, PartSummary, Project } from './db/parts.ts'
import { UNKNOWN_CONCEPT } from './project/project-search.ts'

// What the routes need from the server. A test gives the router its own.
export type Server = {
  fetchSession: () => Promise<Session | undefined>
  fetchProjects: () => Promise<Pick<Project, 'slug' | 'name'>[]>
  fetchProject: (project: string) => Promise<Project | undefined>
  fetchConcept: (concept: {
    project: string
    concept: string
  }) => Promise<Concept | undefined>
  fetchParts: (project: string) => Promise<PartSummary[]>
  fetchPart: (part: {
    project: string
    recordId: string
  }) => Promise<Part | undefined>
  // The writes. A Failure is an answer for the person: the write did not
  // happen and the message says why.
  addProject: (project: ProjectAddInput) => Promise<{ slug: string } | Failure>
  addConcept: (concept: ConceptAddInput) => Promise<{ slug: string } | Failure>
  addPart: (part: PartAddInput) => Promise<SavedPart | Failure>
  updatePart: (part: PartUpdateInput) => Promise<SavedPart | Failure>
  answerPart: (answer: AnswerInput) => Promise<SavedPart | Failure>
  addJoint: (joint: JointAddInput) => Promise<{ id: number } | Failure>
  removeJoint: (joint: JointRemoveInput) => Promise<Failure | undefined>
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
    fetchConcept: (concept) =>
      keepSignInTarget(
        server.fetchConcept(concept),
        concept.concept === concept.project
          ? `/${concept.project}`
          : `/${concept.project}/${concept.concept}`,
      ),
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
