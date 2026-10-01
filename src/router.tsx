import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import {
  fetchSession,
  submitSignIn,
  submitSignOut,
  submitSignUp,
} from './authentication/session.functions.ts'
import {
  fetchConcept,
  fetchProducts,
  fetchRecord,
  submitAcceptDecision,
  submitDiscardInsight,
  submitKeepInsight,
  submitProposeDecision,
  submitUpdateGoal,
} from './db/concept.functions.ts'
import { createRouterContext } from './router-context.ts'
import type { Server, SessionMemory } from './router-context.ts'
import { routeTree } from './routeTree.gen'

// The routes reach the server only through these functions.
const server: Server = {
  fetchSession: () => fetchSession(),
  fetchProducts: () => fetchProducts(),
  fetchConcept: (product) => fetchConcept({ data: product }),
  fetchRecord: (record) => fetchRecord({ data: record }),
  keepInsight: (insight) => submitKeepInsight({ data: insight }),
  discardInsight: (insight) => submitDiscardInsight({ data: insight }),
  acceptDecision: (decision) => submitAcceptDecision({ data: decision }),
  updateGoal: (goal) => submitUpdateGoal({ data: goal }),
  proposeDecision: (proposal) => submitProposeDecision({ data: proposal }),
  signIn: (credentials) => submitSignIn({ data: credentials }),
  signUp: (account) => submitSignUp({ data: account }),
  signOut: () => submitSignOut(),
}

export function getRouter() {
  const memory: SessionMemory = {}

  const router = createTanStackRouter({
    routeTree,
    context: createRouterContext(server, memory),
    // The session goes to the browser with the page.
    dehydrate: () => ({ session: memory.session }),
    hydrate: ({ session }) => {
      memory.session = session
    },
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
