import { createServerFn } from '@tanstack/react-start'

import {
  getAuthenticationServer,
  getRequestCookies,
} from '../authentication/neon-auth.server.ts'
import { findSession } from '../authentication/session.ts'
import { getSetting } from '../settings.server.ts'
import { createDb } from './client.ts'
import {
  createSignalFilterActions,
  signalFilterAddInputSchema,
  signalFilterRemoveInputSchema,
  signalFilterUpdateInputSchema,
  signalFiltersInputSchema,
} from './signal-filter-actions.ts'

// The server functions of the saved filters of the Signals. The validators
// parse the input. Each action looks for the session itself.
const actions = createSignalFilterActions({
  findSession: () =>
    findSession(getAuthenticationServer(), getRequestCookies()),
  getDb: () => createDb(getSetting('DATABASE_URL')),
})

export const fetchSignalFilters = createServerFn({ method: 'GET' })
  .validator(signalFiltersInputSchema)
  .handler(({ data }) => actions.listSignalFilters(data))

export const submitAddSignalFilter = createServerFn({ method: 'POST' })
  .validator(signalFilterAddInputSchema)
  .handler(({ data }) => actions.addSignalFilter(data))

export const submitUpdateSignalFilter = createServerFn({ method: 'POST' })
  .validator(signalFilterUpdateInputSchema)
  .handler(({ data }) => actions.updateSignalFilter(data))

export const submitRemoveSignalFilter = createServerFn({ method: 'POST' })
  .validator(signalFilterRemoveInputSchema)
  .handler(({ data }) => actions.removeSignalFilter(data))
