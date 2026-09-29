import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import {
  fetchSession,
  submitSignIn,
  submitSignOut,
  submitSignUp,
} from './authentication/session.functions.ts'
import { fetchConcept, fetchRecord } from './db/concept.functions.ts'
import type { RouterContext } from './router-context.ts'
import { routeTree } from './routeTree.gen'

// The routes reach the server only through these functions.
const context: RouterContext = {
  fetchSession: () => fetchSession(),
  fetchConcept: () => fetchConcept(),
  fetchRecord: (recordId) => fetchRecord({ data: recordId }),
  signIn: (credentials) => submitSignIn({ data: credentials }),
  signUp: (account) => submitSignUp({ data: account }),
  signOut: () => submitSignOut(),
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
