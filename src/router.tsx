import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import {
  fetchSession,
  submitSignIn,
  submitSignOut,
  submitSignUp,
} from './authentication/session.functions.ts'
import {
  fetchConcept as fetchProductConcept,
  fetchRecord,
  submitProposeDecision,
} from './db/concept.functions.ts'
import {
  fetchConcept,
  fetchPart,
  fetchParts,
  fetchProject,
  fetchProjects,
} from './db/parts.functions.ts'
import { createRouterContext } from './router-context.ts'
import type { Server, SessionMemory } from './router-context.ts'
import { routeTree } from './routeTree.gen'

// The routes reach the server only through these functions.
const server: Server = {
  fetchSession: () => fetchSession(),
  fetchProjects: () => fetchProjects(),
  fetchProject: (project) => fetchProject({ data: { project } }),
  fetchConcept: (concept) => fetchConcept({ data: concept }),
  fetchParts: (project) => fetchParts({ data: { project } }),
  fetchPart: (part) => fetchPart({ data: part }),
  fetchProductConcept: (product) => fetchProductConcept({ data: product }),
  fetchRecord: (record) => fetchRecord({ data: record }),
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
