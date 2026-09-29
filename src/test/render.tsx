import { MantineProvider } from '@mantine/core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach } from 'vitest'

import { theme } from '../theme.ts'

// jsdom has no matchMedia, Mantine asks it for the colour scheme.
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})

// jsdom has no scrollTo, the router calls it after a navigation.
window.scrollTo = () => {}

afterEach(cleanup)

// What a reader sees next to a label: the text of the `dd` after the `dt`.
export function shownValue(label: string): string {
  const value = screen.getByText(label, { selector: 'dt' }).nextElementSibling
  return (value?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// Renders a component as the page at `/`, in the theme, in a router that
// knows the paths of Glue. The links of the component work, the pages behind
// them are empty.
export async function renderInRouter(ui: ReactNode) {
  const root = createRootRoute({
    component: () => (
      <MantineProvider theme={theme}>
        <Outlet />
      </MantineProvider>
    ),
  })
  const paths = ['/concept/$recordId', '/sign-in', '/sign-up']
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => ui,
      }),
      ...paths.map((path) => createRoute({ getParentRoute: () => root, path })),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  return { router, ...render(<RouterProvider router={router} />) }
}
