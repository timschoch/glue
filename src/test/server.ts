import { vi } from 'vitest'

import type { Session } from '../authentication/session.ts'
import type { ProjectIntegrations } from '../db/integration-actions.ts'
import type { Server } from '../router-server.ts'
import { shownSources } from './signal-sources.ts'
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

// What the two tools of the memory server ask of a member: one that Glue
// reads with a key, and one that posts to Glue.
export const toolForms: ProjectIntegrations['tools'] = [
  {
    name: 'github',
    label: 'GitHub',
    addressFields: [{ label: 'Repository' }],
    needsKey: true,
  },
  {
    name: 'webhook',
    label: 'Webhook',
    addressFields: [{ label: 'Name' }],
    needsKey: false,
  },
]

// The server for the tests of the routes, in memory: Ada is signed in, each
// read answers from the Project of project.ts, each write succeeds and saves
// nothing. GitHub has no Signals and no builds. No filter is saved, and the
// Project has no Integration. Each member is a spy. A test
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
    fetchNewFlagCount: vi.fn(() => Promise.resolve(0)),
    setFlagsSeen: vi.fn(() => Promise.resolve(undefined)),
    fetchWatched: vi.fn(() => Promise.resolve([])),
    fetchMeasured: vi.fn(() => Promise.resolve([])),
    fetchMapJoints: vi.fn(() => Promise.resolve([])),
    fetchPart: vi.fn((part) => Promise.resolve(findPart(part))),
    fetchSignals: vi.fn(() =>
      Promise.resolve({
        sources: shownSources,
        signals: [],
        failures: [],
        groups: [],
      }),
    ),
    fetchSignalFilters: vi.fn(() => Promise.resolve([])),
    fetchMineIntegrations: vi.fn(() =>
      Promise.resolve<ProjectIntegrations>({
        tools: toolForms,
        integrations: [],
      }),
    ),
    fetchIntegrations: vi.fn(() =>
      Promise.resolve<ProjectIntegrations>({
        tools: toolForms,
        integrations: [],
      }),
    ),
    fetchBuilds: vi.fn(() => Promise.resolve({ builds: [], reason: null })),
    fetchPeople: vi.fn(() => Promise.resolve(people)),
    fetchMineAsks: vi.fn(() => Promise.resolve([])),
    fetchAskState: vi.fn(() => Promise.resolve({ ask: null, projects: [] })),
    addProject: vi.fn(({ slug }) => Promise.resolve({ slug })),
    addConcept: vi.fn(({ concept }) => Promise.resolve({ slug: concept.slug })),
    updateConcept: vi.fn(() => Promise.resolve(undefined)),
    removeConcept: vi.fn(() => Promise.resolve(undefined)),
    addKind: vi.fn(({ kind }) => Promise.resolve({ slug: kind.slug })),
    updateKind: vi.fn(() => Promise.resolve(undefined)),
    addPart: vi.fn(() => Promise.resolve(saved('D4'))),
    updatePart: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    answerPart: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    answerQuestion: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    addJoint: vi.fn(() => Promise.resolve({ id: 20 })),
    removeJoint: vi.fn(() => Promise.resolve(undefined)),
    addSignalInsight: vi.fn(() => Promise.resolve(saved('I3'))),
    addSignalFilter: vi.fn(() => Promise.resolve({ id: 1 })),
    updateSignalFilter: vi.fn(({ filterId }) =>
      Promise.resolve({ id: filterId }),
    ),
    removeSignalFilter: vi.fn(() => Promise.resolve(undefined)),
    addIntegration: vi.fn(() => Promise.resolve({ id: 1 })),
    pauseIntegration: vi.fn(({ integrationId }) =>
      Promise.resolve({ id: integrationId }),
    ),
    startIntegration: vi.fn(({ integrationId }) =>
      Promise.resolve({ id: integrationId }),
    ),
    setIntegrationKey: vi.fn(({ integrationId }) =>
      Promise.resolve({ id: integrationId }),
    ),
    removeIntegration: vi.fn(() => Promise.resolve(undefined)),
    fetchContractState: vi.fn((concept) =>
      Promise.resolve(findContractState(concept)),
    ),
    fetchContract: vi.fn((contract) => Promise.resolve(findContract(contract))),
    signContract: vi.fn(() => Promise.resolve({ version: 2 })),
    fetchContractQuestions: vi.fn(() => Promise.resolve([])),
    fetchMineContractQuestions: vi.fn(() => Promise.resolve([])),
    askContractQuestion: vi.fn(() => Promise.resolve({ id: 1 })),
    answerContractQuestion: vi.fn(({ questionId }) =>
      Promise.resolve({ id: questionId }),
    ),
    addMember: vi.fn(() => Promise.resolve(people.members[1])),
    setLoopSteps: vi.fn(() => Promise.resolve(undefined)),
    assign: vi.fn(() => Promise.resolve(undefined)),
    unassign: vi.fn(() => Promise.resolve(undefined)),
    watch: vi.fn(() => Promise.resolve(undefined)),
    unwatch: vi.fn(() => Promise.resolve(undefined)),
    addAsk: vi.fn(() => Promise.resolve({ id: 1 })),
    pickAsk: vi.fn(() => Promise.resolve(undefined)),
    startStudy: vi.fn(() => Promise.resolve({ slug: 'study-1' })),
    handBackAsk: vi.fn(() => Promise.resolve(undefined)),
    takeBackAsk: vi.fn(() => Promise.resolve(undefined)),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
    ...changed,
  }
}
