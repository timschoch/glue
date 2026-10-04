// The server handlers of the Concept HTTP API routes in src/routes/api/.
// `/api/v1/projects/{project}` and the deprecated `/api/v1/products/{product}`
// share them, so both paths answer the same.
import { createDb } from '../db/client.ts'
import { createGithubClient } from '../github/client.ts'
import { createMetricSource } from '../measure/metric-source.server.ts'
import { getSetting } from '../settings.server.ts'
import {
  handleAddRecord,
  handleGetConcept,
  handleGetRecord,
  handleListRecords,
  handleMeasureProject,
  handleUpdateRecord,
} from './concept-api.ts'
import type { ApiRequest } from './concept-api.ts'
import { handleGetContract, handleSignContract } from './contract-api.ts'
import {
  handleAddConcept,
  handleAddJoint,
  handleAddPart,
  handleAnswerPart,
  handleAnswerQuestion,
  handleGetPart,
  handleGetProject,
  handleGetProjectConcept,
  handleListMine,
  handleListParts,
  handleRemoveJoint,
  handleUpdatePart,
} from './part-api.ts'
import {
  handleAddMember,
  handleAssign,
  handleListAssignments,
  handleListMembers,
  handleUnassign,
} from './people-api.ts'
import { handleAddSignalInsight, handleListSignals } from './signal-api.ts'
import { handleListBuilds } from './build-api.ts'

type PathParams = {
  folder?: string
  recordId?: string
  concept?: string
  jointId?: string
} & ({ project: string } | { product: string })

type RouteRequest = { request: Request; params: PathParams }

export function toProjectParams(params: PathParams): ApiRequest['params'] {
  if ('project' in params) return params
  const { product, ...rest } = params
  return { project: product, ...rest }
}

function toApiRequest({ request, params }: RouteRequest): ApiRequest {
  return {
    db: createDb(getSetting('DATABASE_URL')),
    request,
    params: toProjectParams(params),
  }
}

function toChangeRequest(route: RouteRequest) {
  return { ...toApiRequest(route), github: createGithubClient() }
}

// The routes of the Part model. They have no deprecated `products` path.
export const projectHandlers = {
  GET: (route: RouteRequest) => handleGetProject(toApiRequest(route)),
}

export const projectConceptsHandlers = {
  POST: (route: RouteRequest) => handleAddConcept(toApiRequest(route)),
}

export const projectConceptHandlers = {
  GET: (route: RouteRequest) => handleGetProjectConcept(toApiRequest(route)),
}

export const contractHandlers = {
  GET: (route: RouteRequest) => handleGetContract(toApiRequest(route)),
  POST: (route: RouteRequest) => handleSignContract(toApiRequest(route)),
}

export const partsHandlers = {
  GET: (route: RouteRequest) => handleListParts(toApiRequest(route)),
  POST: (route: RouteRequest) => handleAddPart(toChangeRequest(route)),
}

export const partHandlers = {
  GET: (route: RouteRequest) => handleGetPart(toChangeRequest(route)),
  PATCH: (route: RouteRequest) => handleUpdatePart(toChangeRequest(route)),
}

export const answersHandlers = {
  POST: (route: RouteRequest) => handleAnswerPart(toChangeRequest(route)),
}

export const questionAnswersHandlers = {
  POST: (route: RouteRequest) => handleAnswerQuestion(toChangeRequest(route)),
}

export const mineHandlers = {
  GET: (route: RouteRequest) => handleListMine(toApiRequest(route)),
}

export const jointsHandlers = {
  POST: (route: RouteRequest) => handleAddJoint(toApiRequest(route)),
}

export const jointHandlers = {
  DELETE: (route: RouteRequest) => handleRemoveJoint(toApiRequest(route)),
}

export const signalsHandlers = {
  GET: (route: RouteRequest) => handleListSignals(toChangeRequest(route)),
}

export const buildsHandlers = {
  GET: (route: RouteRequest) => handleListBuilds(toChangeRequest(route)),
}

export const signalInsightsHandlers = {
  POST: (route: RouteRequest) => handleAddSignalInsight(toChangeRequest(route)),
}

export const membersHandlers = {
  GET: (route: RouteRequest) => handleListMembers(toApiRequest(route)),
  POST: (route: RouteRequest) => handleAddMember(toApiRequest(route)),
}

export const assignmentsHandlers = {
  GET: (route: RouteRequest) => handleListAssignments(toApiRequest(route)),
  POST: (route: RouteRequest) => handleAssign(toApiRequest(route)),
  DELETE: (route: RouteRequest) => handleUnassign(toApiRequest(route)),
}

export const conceptHandlers = {
  GET: (route: RouteRequest) => handleGetConcept(toApiRequest(route)),
}

export const folderHandlers = {
  GET: (route: RouteRequest) => handleListRecords(toApiRequest(route)),
  POST: (route: RouteRequest) =>
    handleAddRecord({ ...toApiRequest(route), github: createGithubClient() }),
}

export const recordHandlers = {
  GET: (route: RouteRequest) => handleGetRecord(toApiRequest(route)),
  PATCH: (route: RouteRequest) =>
    handleUpdateRecord({
      ...toApiRequest(route),
      github: createGithubClient(),
    }),
}

export const measureHandlers = {
  POST: (route: RouteRequest) =>
    handleMeasureProject({
      ...toApiRequest(route),
      source: createMetricSource(),
    }),
}
