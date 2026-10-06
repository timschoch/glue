import { createServerFn } from '@tanstack/react-start'

import {
  getAuthenticationServer,
  getRequestCookies,
} from '../authentication/neon-auth.server.ts'
import { findSession } from '../authentication/session.ts'
import { createGithubClient } from '../github/client.ts'
import { getSetting } from '../settings.server.ts'
import { createDb } from './client.ts'
import {
  answerInputSchema,
  askAddInputSchema,
  askHandBackInputSchema,
  askPickInputSchema,
  askTakeBackInputSchema,
  assignInputSchema,
  buildsInputSchema,
  questionAnswerInputSchema,
  conceptAddInputSchema,
  conceptReadInputSchema,
  createPartActions,
  jointAddInputSchema,
  jointRemoveInputSchema,
  loopStepsInputSchema,
  memberAddInputSchema,
  partAddInputSchema,
  partListInputSchema,
  partReadInputSchema,
  partUpdateInputSchema,
  projectAddInputSchema,
  projectInputSchema,
  signalInsightAddInputSchema,
  unassignInputSchema,
} from './part-actions.ts'

// The server functions of the Part model. The validators parse the input.
// Each action looks for the session itself.
const actions = createPartActions({
  findSession: () =>
    findSession(getAuthenticationServer(), getRequestCookies()),
  getDb: () => createDb(getSetting('DATABASE_URL')),
  getGithub: createGithubClient,
})

export const fetchProjects = createServerFn({ method: 'GET' }).handler(() =>
  actions.listProjects(),
)

export const fetchProject = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.findProject(data))

export const fetchConcept = createServerFn({ method: 'GET' })
  .validator(conceptReadInputSchema)
  .handler(({ data }) => actions.findConcept(data))

export const fetchParts = createServerFn({ method: 'GET' })
  .validator(partListInputSchema)
  .handler(({ data }) => actions.listParts(data))

export const fetchPart = createServerFn({ method: 'GET' })
  .validator(partReadInputSchema)
  .handler(({ data }) => actions.findPart(data))

export const fetchMine = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.listMine(data))

export const fetchWatched = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.listWatched(data))

export const fetchMeasured = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.listMeasured(data))

export const fetchMapJoints = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.listMapJoints(data))

export const submitAddConcept = createServerFn({ method: 'POST' })
  .validator(conceptAddInputSchema)
  .handler(({ data }) => actions.addConcept(data))

export const submitRemoveConcept = createServerFn({ method: 'POST' })
  .validator(conceptReadInputSchema)
  .handler(({ data }) => actions.removeConcept(data))

export const submitAddPart = createServerFn({ method: 'POST' })
  .validator(partAddInputSchema)
  .handler(({ data }) => actions.addPart(data))

export const submitUpdatePart = createServerFn({ method: 'POST' })
  .validator(partUpdateInputSchema)
  .handler(({ data }) => actions.updatePart(data))

export const submitAnswer = createServerFn({ method: 'POST' })
  .validator(answerInputSchema)
  .handler(({ data }) => actions.answerPart(data))

export const submitQuestionAnswer = createServerFn({ method: 'POST' })
  .validator(questionAnswerInputSchema)
  .handler(({ data }) => actions.answerQuestion(data))

export const submitAddProject = createServerFn({ method: 'POST' })
  .validator(projectAddInputSchema)
  .handler(({ data }) => actions.addProject(data))

export const fetchSignals = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.listSignals(data))

export const fetchBuilds = createServerFn({ method: 'GET' })
  .validator(buildsInputSchema)
  .handler(({ data }) => actions.listBuilds(data))

export const submitAddSignalInsight = createServerFn({ method: 'POST' })
  .validator(signalInsightAddInputSchema)
  .handler(({ data }) => actions.addSignalInsight(data))

export const submitAddJoint = createServerFn({ method: 'POST' })
  .validator(jointAddInputSchema)
  .handler(({ data }) => actions.addJoint(data))

export const submitRemoveJoint = createServerFn({ method: 'POST' })
  .validator(jointRemoveInputSchema)
  .handler(({ data }) => actions.removeJoint(data))

export const fetchPeople = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.findPeople(data))

export const submitAddMember = createServerFn({ method: 'POST' })
  .validator(memberAddInputSchema)
  .handler(({ data }) => actions.addMember(data))

export const submitSetLoopSteps = createServerFn({ method: 'POST' })
  .validator(loopStepsInputSchema)
  .handler(({ data }) => actions.setLoopSteps(data))

export const submitAssign = createServerFn({ method: 'POST' })
  .validator(assignInputSchema)
  .handler(({ data }) => actions.assign(data))

export const submitUnassign = createServerFn({ method: 'POST' })
  .validator(unassignInputSchema)
  .handler(({ data }) => actions.unassign(data))

export const submitWatch = createServerFn({ method: 'POST' })
  .validator(partReadInputSchema)
  .handler(({ data }) => actions.watch(data))

export const submitUnwatch = createServerFn({ method: 'POST' })
  .validator(partReadInputSchema)
  .handler(({ data }) => actions.unwatch(data))

export const fetchMineAsks = createServerFn({ method: 'GET' })
  .validator(projectInputSchema)
  .handler(({ data }) => actions.listMineAsks(data))

export const fetchAskState = createServerFn({ method: 'GET' })
  .validator(partReadInputSchema)
  .handler(({ data }) => actions.findAskState(data))

export const submitAddAsk = createServerFn({ method: 'POST' })
  .validator(askAddInputSchema)
  .handler(({ data }) => actions.addAsk(data))

export const submitPickAsk = createServerFn({ method: 'POST' })
  .validator(askPickInputSchema)
  .handler(({ data }) => actions.pickAsk(data))

export const submitHandBackAsk = createServerFn({ method: 'POST' })
  .validator(askHandBackInputSchema)
  .handler(({ data }) => actions.handBackAsk(data))

export const submitTakeBackAsk = createServerFn({ method: 'POST' })
  .validator(askTakeBackInputSchema)
  .handler(({ data }) => actions.takeBackAsk(data))
