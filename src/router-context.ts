import { isRedirect, redirect } from '@tanstack/react-router'

import type { SignIn, SignUp } from './authentication/credentials.ts'
import { parseRedirect } from './authentication/redirect.ts'
import type { Failure, Session } from './authentication/session.ts'
import type { ProjectBuilds } from './db/builds.ts'
import type { Contract, ContractState } from './db/contracts.ts'
import type { Member, People } from './db/members.ts'
import type {
  AnswerInput,
  AssignInput,
  ConceptAddInput,
  JointAddInput,
  JointRemoveInput,
  LoopStepsInput,
  MemberAddInput,
  PartAddInput,
  PartUpdateInput,
  ProjectAddInput,
  SavedPart,
  SignalInsightAddInput,
  UnassignInput,
} from './db/part-actions.ts'
import type {
  Concept,
  MeasuredPart,
  Part,
  PartSummary,
  Project,
} from './db/parts.ts'
import type { ProjectSignals } from './db/signals.ts'
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
  // The Parts of the Project that need the owner, the newest change first.
  fetchMine: (project: string) => Promise<PartSummary[]>
  // The Metrics and the measured Goals of the Project, each with its newest
  // reading.
  fetchMeasured: (project: string) => Promise<MeasuredPart[]>
  fetchPart: (part: {
    project: string
    recordId: string
  }) => Promise<Part | undefined>
  fetchSignals: (project: string) => Promise<ProjectSignals>
  fetchBuilds: (project: string) => Promise<ProjectBuilds>
  fetchPeople: (project: string) => Promise<People>
  // The writes. A Failure is an answer for the person: the write did not
  // happen and the message says why.
  addProject: (project: ProjectAddInput) => Promise<{ slug: string } | Failure>
  addConcept: (concept: ConceptAddInput) => Promise<{ slug: string } | Failure>
  addPart: (part: PartAddInput) => Promise<SavedPart | Failure>
  updatePart: (part: PartUpdateInput) => Promise<SavedPart | Failure>
  answerPart: (answer: AnswerInput) => Promise<SavedPart | Failure>
  addJoint: (joint: JointAddInput) => Promise<{ id: number } | Failure>
  removeJoint: (joint: JointRemoveInput) => Promise<Failure | undefined>
  addSignalInsight: (
    insight: SignalInsightAddInput,
  ) => Promise<SavedPart | Failure>
  fetchContractState: (concept: {
    project: string
    concept: string
  }) => Promise<ContractState | undefined>
  // Without a version: the newest Contract Version.
  fetchContract: (contract: {
    project: string
    concept: string
    version?: number
  }) => Promise<Contract | undefined>
  // The person of the session signs.
  signContract: (concept: {
    project: string
    concept: string
  }) => Promise<{ version: number } | Failure>
  addMember: (member: MemberAddInput) => Promise<Member | Failure>
  setLoopSteps: (loopSteps: LoopStepsInput) => Promise<Failure | undefined>
  assign: (assignment: AssignInput) => Promise<Failure | undefined>
  unassign: (assignment: UnassignInput) => Promise<Failure | undefined>
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
    fetchMeasured: (project) =>
      keepSignInTarget(server.fetchMeasured(project), `/${project}`),
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
    fetchBuilds: (project) =>
      keepSignInTarget(server.fetchBuilds(project), `/${project}`),
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
