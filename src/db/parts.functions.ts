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
  conceptAddInputSchema,
  conceptReadInputSchema,
  createPartActions,
  jointAddInputSchema,
  jointRemoveInputSchema,
  partAddInputSchema,
  partListInputSchema,
  partReadInputSchema,
  partUpdateInputSchema,
  projectInputSchema,
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

export const submitAddConcept = createServerFn({ method: 'POST' })
  .validator(conceptAddInputSchema)
  .handler(({ data }) => actions.addConcept(data))

export const submitAddPart = createServerFn({ method: 'POST' })
  .validator(partAddInputSchema)
  .handler(({ data }) => actions.addPart(data))

export const submitUpdatePart = createServerFn({ method: 'POST' })
  .validator(partUpdateInputSchema)
  .handler(({ data }) => actions.updatePart(data))

export const submitAddJoint = createServerFn({ method: 'POST' })
  .validator(jointAddInputSchema)
  .handler(({ data }) => actions.addJoint(data))

export const submitRemoveJoint = createServerFn({ method: 'POST' })
  .validator(jointRemoveInputSchema)
  .handler(({ data }) => actions.removeJoint(data))
