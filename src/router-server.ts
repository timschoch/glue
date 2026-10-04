import type { SignIn, SignUp } from './authentication/credentials.ts'
import {
  fetchSession,
  submitSignIn,
  submitSignOut,
  submitSignUp,
} from './authentication/session.functions.ts'
import {
  fetchContract,
  fetchContractState,
  submitSignContract,
} from './db/contracts.functions.ts'
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
  QuestionAnswerInput,
  SignalInsightAddInput,
  UnassignInput,
} from './db/part-actions.ts'
import {
  fetchBuilds,
  fetchConcept,
  fetchMeasured,
  fetchMine,
  fetchPart,
  fetchParts,
  fetchPeople,
  fetchProject,
  fetchProjects,
  fetchSignals,
  submitAddConcept,
  submitAddJoint,
  submitAddMember,
  submitAddPart,
  submitAddProject,
  submitAddSignalInsight,
  submitAnswer,
  submitAssign,
  submitQuestionAnswer,
  submitRemoveJoint,
  submitSetLoopSteps,
  submitUnassign,
  submitUpdatePart,
} from './db/parts.functions.ts'

type ConceptInput = { project: string; concept: string }

// The routes reach the server only through these functions. Each one names
// its input, its answer is the answer of the server function.
export const server = {
  fetchSession: () => fetchSession(),
  fetchProjects: () => fetchProjects(),
  fetchProject: (project: string) => fetchProject({ data: { project } }),
  fetchConcept: (concept: ConceptInput) => fetchConcept({ data: concept }),
  fetchParts: (project: string) => fetchParts({ data: { project } }),
  // The Parts of the Project that need the owner, the newest change first.
  fetchMine: (project: string) => fetchMine({ data: { project } }),
  // The Metrics and the measured Goals of the Project, each with its newest
  // reading.
  fetchMeasured: (project: string) => fetchMeasured({ data: { project } }),
  fetchPart: (part: { project: string; recordId: string }) =>
    fetchPart({ data: part }),
  fetchSignals: (project: string) => fetchSignals({ data: { project } }),
  fetchBuilds: (project: string) => fetchBuilds({ data: { project } }),
  fetchPeople: (project: string) => fetchPeople({ data: { project } }),
  // The writes. A Failure is an answer for the person: the write did not
  // happen and the message says why.
  addProject: (project: ProjectAddInput) => submitAddProject({ data: project }),
  addConcept: (concept: ConceptAddInput) => submitAddConcept({ data: concept }),
  addPart: (part: PartAddInput) => submitAddPart({ data: part }),
  updatePart: (part: PartUpdateInput) => submitUpdatePart({ data: part }),
  answerPart: (answer: AnswerInput) => submitAnswer({ data: answer }),
  answerQuestion: (answer: QuestionAnswerInput) =>
    submitQuestionAnswer({ data: answer }),
  addJoint: (joint: JointAddInput) => submitAddJoint({ data: joint }),
  removeJoint: (joint: JointRemoveInput) => submitRemoveJoint({ data: joint }),
  addSignalInsight: (insight: SignalInsightAddInput) =>
    submitAddSignalInsight({ data: insight }),
  fetchContractState: (concept: ConceptInput) =>
    fetchContractState({ data: concept }),
  // Without a version: the newest Contract Version.
  fetchContract: (contract: ConceptInput & { version?: number }) =>
    fetchContract({ data: contract }),
  // The person of the session signs.
  signContract: (concept: ConceptInput) =>
    submitSignContract({ data: concept }),
  addMember: (member: MemberAddInput) => submitAddMember({ data: member }),
  setLoopSteps: (loopSteps: LoopStepsInput) =>
    submitSetLoopSteps({ data: loopSteps }),
  assign: (assignment: AssignInput) => submitAssign({ data: assignment }),
  unassign: (assignment: UnassignInput) => submitUnassign({ data: assignment }),
  signIn: (credentials: SignIn) => submitSignIn({ data: credentials }),
  signUp: (account: SignUp) => submitSignUp({ data: account }),
  signOut: () => submitSignOut(),
}

// What the routes need from the server. A test gives the router its own:
// src/test/server.ts.
export type Server = typeof server
