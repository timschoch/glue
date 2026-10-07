import type { SignIn, SignUp } from './authentication/credentials.ts'
import {
  fetchSession,
  submitSignIn,
  submitSignOut,
  submitSignUp,
} from './authentication/session.functions.ts'
import type {
  ContractQuestionAnswerInput,
  ContractQuestionAskInput,
} from './db/contract-actions.ts'
import {
  fetchContract,
  fetchContractQuestions,
  fetchContractState,
  fetchMineContractQuestions,
  submitAnswerContractQuestion,
  submitAskContractQuestion,
  submitSignContract,
} from './db/contracts.functions.ts'
import type { BuildsNamed } from './db/builds.ts'
import type {
  AnswerInput,
  AskAddInput,
  AskHandBackInput,
  AskPickInput,
  AskTakeBackInput,
  AssignInput,
  ConceptAddInput,
  ConceptUpdateInput,
  JointAddInput,
  JointRemoveInput,
  KindAddInput,
  KindUpdateInput,
  LoopStepsInput,
  MemberAddInput,
  PartAddInput,
  PartReadInput,
  PartUpdateInput,
  ProjectAddInput,
  QuestionAnswerInput,
  SignalInsightAddInput,
  UnassignInput,
} from './db/part-actions.ts'
import {
  fetchAskState,
  fetchBuilds,
  fetchConcept,
  fetchMapJoints,
  fetchMeasured,
  fetchMine,
  fetchMineAsks,
  fetchNewFlagCount,
  fetchPart,
  fetchParts,
  fetchPeople,
  fetchProject,
  fetchProjects,
  fetchSignals,
  fetchWatched,
  submitAddAsk,
  submitAddConcept,
  submitAddJoint,
  submitAddKind,
  submitAddMember,
  submitAddPart,
  submitAddProject,
  submitAddSignalInsight,
  submitAnswer,
  submitAssign,
  submitHandBackAsk,
  submitPickAsk,
  submitStartStudy,
  submitTakeBackAsk,
  submitQuestionAnswer,
  submitRemoveConcept,
  submitRemoveJoint,
  submitSetFlagsSeen,
  submitSetLoopSteps,
  submitUnassign,
  submitUnwatch,
  submitUpdateConcept,
  submitUpdateKind,
  submitUpdatePart,
  submitWatch,
} from './db/parts.functions.ts'
import type {
  SignalFilterAddInput,
  SignalFilterRemoveInput,
  SignalFilterUpdateInput,
} from './db/signal-filter-actions.ts'
import {
  fetchSignalFilters,
  submitAddSignalFilter,
  submitRemoveSignalFilter,
  submitUpdateSignalFilter,
} from './db/signal-filters.functions.ts'

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
  // The count of the flags that the person can answer and did not see yet.
  fetchNewFlagCount: (project: string) =>
    fetchNewFlagCount({ data: { project } }),
  // The person saw them: Mine is open.
  setFlagsSeen: (project: { project: string }) =>
    submitSetFlagsSeen({ data: project }),
  // The Parts of the Project that the person watches, each with its open
  // flags.
  fetchWatched: (project: string) => fetchWatched({ data: { project } }),
  // The Metrics and the measured Goals of the Project, each with its newest
  // reading.
  fetchMeasured: (project: string) => fetchMeasured({ data: { project } }),
  // The Joints of the Project as the Map draws them.
  fetchMapJoints: (project: string) => fetchMapJoints({ data: { project } }),
  fetchPart: (part: { project: string; recordId: string }) =>
    fetchPart({ data: part }),
  fetchSignals: (project: string) => fetchSignals({ data: { project } }),
  // The saved filters of the Signals of the Project, by name.
  fetchSignalFilters: (project: string) =>
    fetchSignalFilters({ data: { project } }),
  // Without `named`: the builds of the Project. With it: each build that
  // names the Decision or the Contract of the Concept.
  fetchBuilds: (project: string, named?: BuildsNamed) =>
    fetchBuilds({ data: { project, named } }),
  fetchPeople: (project: string) => fetchPeople({ data: { project } }),
  // The open Asks that need the person: to pick, to hand back or to check.
  fetchMineAsks: (project: string) => fetchMineAsks({ data: { project } }),
  // The open Ask of the record, and the Projects that the Project may ask.
  fetchAskState: (part: PartReadInput) => fetchAskState({ data: part }),
  // The writes. A Failure is an answer for the person: the write did not
  // happen and the message says why.
  addProject: (project: ProjectAddInput) => submitAddProject({ data: project }),
  addConcept: (concept: ConceptAddInput) => submitAddConcept({ data: concept }),
  updateConcept: (concept: ConceptUpdateInput) =>
    submitUpdateConcept({ data: concept }),
  removeConcept: (concept: ConceptInput) =>
    submitRemoveConcept({ data: concept }),
  addKind: (kind: KindAddInput) => submitAddKind({ data: kind }),
  // `kind` is the slug of the Kind.
  updateKind: (kind: KindUpdateInput) => submitUpdateKind({ data: kind }),
  addPart: (part: PartAddInput) => submitAddPart({ data: part }),
  updatePart: (part: PartUpdateInput) => submitUpdatePart({ data: part }),
  answerPart: (answer: AnswerInput) => submitAnswer({ data: answer }),
  answerQuestion: (answer: QuestionAnswerInput) =>
    submitQuestionAnswer({ data: answer }),
  addJoint: (joint: JointAddInput) => submitAddJoint({ data: joint }),
  removeJoint: (joint: JointRemoveInput) => submitRemoveJoint({ data: joint }),
  addSignalInsight: (insight: SignalInsightAddInput) =>
    submitAddSignalInsight({ data: insight }),
  // A change of a saved filter puts its values in place of all the old ones.
  addSignalFilter: (filter: SignalFilterAddInput) =>
    submitAddSignalFilter({ data: filter }),
  updateSignalFilter: (filter: SignalFilterUpdateInput) =>
    submitUpdateSignalFilter({ data: filter }),
  removeSignalFilter: (filter: SignalFilterRemoveInput) =>
    submitRemoveSignalFilter({ data: filter }),
  fetchContractState: (concept: ConceptInput) =>
    fetchContractState({ data: concept }),
  // Without a version: the newest Contract Version.
  fetchContract: (contract: ConceptInput & { version?: number }) =>
    fetchContract({ data: contract }),
  // The person of the session signs.
  signContract: (concept: ConceptInput) =>
    submitSignContract({ data: concept }),
  // The questions about the Contract Versions of the Concept, the newest
  // first.
  fetchContractQuestions: (concept: ConceptInput) =>
    fetchContractQuestions({ data: concept }),
  // The open questions that the person answers.
  fetchMineContractQuestions: (project: string) =>
    fetchMineContractQuestions({ data: { project } }),
  // The person of the session asks about the newest Version, and answers.
  askContractQuestion: (question: ContractQuestionAskInput) =>
    submitAskContractQuestion({ data: question }),
  answerContractQuestion: (answer: ContractQuestionAnswerInput) =>
    submitAnswerContractQuestion({ data: answer }),
  addMember: (member: MemberAddInput) => submitAddMember({ data: member }),
  setLoopSteps: (loopSteps: LoopStepsInput) =>
    submitSetLoopSteps({ data: loopSteps }),
  assign: (assignment: AssignInput) => submitAssign({ data: assignment }),
  unassign: (assignment: UnassignInput) => submitUnassign({ data: assignment }),
  // The person of the session watches the Part, and stops.
  watch: (part: PartReadInput) => submitWatch({ data: part }),
  unwatch: (part: PartReadInput) => submitUnwatch({ data: part }),
  // The Project of `pickAsk` and `handBackAsk` is the one that is asked.
  addAsk: (ask: AskAddInput) => submitAddAsk({ data: ask }),
  pickAsk: (ask: AskPickInput) => submitPickAsk({ data: ask }),
  startStudy: (ask: AskPickInput) => submitStartStudy({ data: ask }),
  handBackAsk: (ask: AskHandBackInput) => submitHandBackAsk({ data: ask }),
  takeBackAsk: (ask: AskTakeBackInput) => submitTakeBackAsk({ data: ask }),
  signIn: (credentials: SignIn) => submitSignIn({ data: credentials }),
  signUp: (account: SignUp) => submitSignUp({ data: account }),
  signOut: () => submitSignOut(),
}

// What the routes need from the server. A test gives the router its own:
// src/test/server.ts.
export type Server = typeof server
