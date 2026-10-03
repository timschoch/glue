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

type PathParams = { folder?: string; recordId?: string } & (
  { project: string } | { product: string }
)

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
