import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import { createRouterContext } from './router-context.ts'
import type { SessionMemory } from './router-context.ts'
import { server } from './router-server.ts'
import { routeTree } from './routeTree.gen'

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
