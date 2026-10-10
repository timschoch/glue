import { createServerFn } from '@tanstack/react-start'

import {
  getAuthenticationServer,
  getRequestCookies,
} from '../authentication/neon-auth.server.ts'
import { findSession } from '../authentication/session.ts'
import { getSetting } from '../settings.server.ts'
import { createServerIntegrations } from '../signals/integrations.server.ts'
import { createDb } from './client.ts'
import {
  createIntegrationActions,
  integrationAddInputSchema,
  integrationChangeInputSchema,
  integrationsInputSchema,
} from './integration-actions.ts'

// The server functions of the Integrations of a Project. The validators
// parse the input. Each action looks for the session itself.
const actions = createIntegrationActions({
  findSession: () =>
    findSession(getAuthenticationServer(), getRequestCookies()),
  getDb: () => createDb(getSetting('DATABASE_URL')),
  getIntegrations: createServerIntegrations,
})

export const fetchIntegrations = createServerFn({ method: 'GET' })
  .validator(integrationsInputSchema)
  .handler(({ data }) => actions.listIntegrations(data))

export const submitAddIntegration = createServerFn({ method: 'POST' })
  .validator(integrationAddInputSchema)
  .handler(({ data }) => actions.addIntegration(data))

export const submitPauseIntegration = createServerFn({ method: 'POST' })
  .validator(integrationChangeInputSchema)
  .handler(({ data }) => actions.pauseIntegration(data))

export const submitStartIntegration = createServerFn({ method: 'POST' })
  .validator(integrationChangeInputSchema)
  .handler(({ data }) => actions.startIntegration(data))

export const submitRemoveIntegration = createServerFn({ method: 'POST' })
  .validator(integrationChangeInputSchema)
  .handler(({ data }) => actions.removeIntegration(data))
