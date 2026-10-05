import { vi } from 'vitest'

import type { Session } from '../authentication/session.ts'
import type { Server } from '../router-server.ts'
import {
  findConcept,
  findContract,
  findContractState,
  findPart,
  findProject,
  parts,
  people,
  projects,
} from './project.ts'

// Ada, the first member of Glue.
export const session: Session = {
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
}

const saved = (id: string) => ({ id, issueMissing: false })

// The server for the tests of the routes, in memory: Ada is signed in, each
// read answers from the Project of project.ts, each write succeeds and saves
// nothing. GitHub has no Signals and no builds. Each member is a spy. A test
// gives its own member for another answer.
export function createMemoryServer(changed: Partial<Server> = {}): Server {
  return {
    fetchSession: vi.fn(() => Promise.resolve<Session | undefined>(session)),
    fetchProjects: vi.fn(() => Promise.resolve(projects)),
    fetchProject: vi.fn((project) => Promise.resolve(findProject(project))),
    fetchConcept: vi.fn((concept) => Promise.resolve(findConcept(concept))),
    fetchParts: vi.fn((project) =>
      Promise.resolve(project === 'glue' ? parts : []),
    ),
    fetchMine: vi.fn(() => Promise.resolve([])),
    fetchWatched: vi.fn(() => Promise.resolve([])),
    fetchMeasured: vi.fn(() => Promise.resolve([])),
    fetchMapJoints: vi.fn(() => Promise.resolve([])),
    fetchPart: vi.fn((part) => Promise.resolve(findPart(part))),
    fetchSignals: vi.fn(() => Promise.resolve({ signals: [], reason: null })),
    fetchBuilds: vi.fn(() => Promise.resolve({ builds: [], reason: null })),
    fetchPeople: vi.fn(() => Promise.resolve(people)),
    addProject: vi.fn(({ slug }) => Promise.resolve({ slug })),
    addConcept: vi.fn(({ concept }) => Promise.resolve({ slug: concept.slug })),
    removeConcept: vi.fn(() => Promise.resolve(undefined)),
    addPart: vi.fn(() => Promise.resolve(saved('D4'))),
    updatePart: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    answerPart: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    answerQuestion: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    addJoint: vi.fn(() => Promise.resolve({ id: 20 })),
    removeJoint: vi.fn(() => Promise.resolve(undefined)),
    addSignalInsight: vi.fn(() => Promise.resolve(saved('I3'))),
    fetchContractState: vi.fn((concept) =>
      Promise.resolve(findContractState(concept)),
    ),
    fetchContract: vi.fn((contract) => Promise.resolve(findContract(contract))),
    signContract: vi.fn(() => Promise.resolve({ version: 2 })),
    addMember: vi.fn(() => Promise.resolve(people.members[1])),
    setLoopSteps: vi.fn(() => Promise.resolve(undefined)),
    assign: vi.fn(() => Promise.resolve(undefined)),
    unassign: vi.fn(() => Promise.resolve(undefined)),
    watch: vi.fn(() => Promise.resolve(undefined)),
    unwatch: vi.fn(() => Promise.resolve(undefined)),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
    ...changed,
  }
}
