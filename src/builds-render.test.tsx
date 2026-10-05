// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createRouterContext } from './router-context.ts'
import type { Server } from './router-server.ts'
import { routeTree } from './routeTree.gen'
import { builds } from './test/project.ts'
import './test/render.tsx'
import { createMemoryServer } from './test/server.ts'

// The pages of Glue with a signed-in person. GitHub has two builds: one
// names the Decision D4, one names an old Contract Version of the Part model.
async function renderPage(path: string, overrides: Partial<Server> = {}) {
  const server = createMemoryServer({
    fetchBuilds: vi.fn(() => Promise.resolve({ builds, reason: null })),
    ...overrides,
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: createRouterContext(server),
  })
  await router.load()
  render(<RouterProvider router={router} />)

  return { server }
}

// The titles of the builds in the list with the heading Builds.
function listed() {
  return within(screen.getByRole('region', { name: 'Builds' }))
    .getAllByRole('link')
    .map((link) => link.textContent)
    .filter((title) => builds.some((build) => build.title === title))
}

describe('the builds of a Project', () => {
  it('shows in the section Build each build with what it names and the stale mark', async () => {
    const { server } = await renderPage('/glue?section=Build')

    const list = within(screen.getByRole('region', { name: 'Builds' }))
    const [open, old] = list.getAllByRole('listitem')

    expect(server.fetchBuilds).toHaveBeenCalledWith('glue')
    expect(listed()).toEqual([
      'Read the Concept from the database',
      'Add the Part tables',
    ])
    within(open).getByText('Open')
    expect(
      within(open).getByRole('link', { name: /D4/ }).getAttribute('href'),
    ).toBe('/glue/part-model/D4?section=Build')
    expect(within(open).queryByText('Stale')).toBeNull()
    within(old).getByText('Merged')
    within(old).getByText('Stale')
    expect(
      within(old)
        .getByRole('link', { name: 'Part model Version 1' })
        .getAttribute('href'),
    ).toBe('/glue/part-model/contract/1?section=Build')
  })

  it('says why the section Build has no builds', async () => {
    await renderPage('/glue?section=Build', {
      fetchBuilds: vi.fn(() =>
        Promise.resolve({
          builds: [],
          reason: 'The Project has no repository',
        }),
      ),
    })

    screen.getByText('The Project has no repository')
  })

  it('reads no builds for a Concept without a Contract Version in another section', async () => {
    const { server } = await renderPage('/glue/flows?section=Decide')

    expect(server.fetchBuilds).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Builds' })).toBeNull()
  })

  it('shows on the record of a Decision the builds that name it', async () => {
    const { server } = await renderPage('/glue/part-model/D4', {
      fetchBuilds: vi.fn(() =>
        Promise.resolve({ builds: [builds[0]], reason: null }),
      ),
    })

    expect(server.fetchBuilds).toHaveBeenCalledTimes(1)
    expect(server.fetchBuilds).toHaveBeenCalledWith('glue', { decision: 'D4' })
    expect(listed()).toEqual(['Read the Concept from the database'])
  })

  it('shows on the record of a Decision no builds when GitHub fails', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchBuilds: vi.fn(() =>
        Promise.resolve({ builds: [], reason: 'GitHub answered 503' }),
      ),
    })

    screen.getByRole('heading', { name: 'The Concept lives in the database' })
    expect(screen.queryByRole('region', { name: 'Builds' })).toBeNull()
    expect(screen.queryByText('GitHub answered 503')).toBeNull()
  })

  it('shows on the record of a Decision no card of this Decision in a build', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchBuilds: vi.fn(() =>
        Promise.resolve({ builds: [builds[0]], reason: null }),
      ),
    })

    const list = within(screen.getByRole('region', { name: 'Builds' }))

    expect(list.queryByRole('link', { name: /D4/ })).toBeNull()
  })

  it('shows in the Contract of a Concept the builds that name it', async () => {
    const { server } = await renderPage('/glue/part-model', {
      fetchBuilds: vi.fn(() =>
        Promise.resolve({ builds: [builds[1]], reason: null }),
      ),
    })

    const contract = within(screen.getByRole('region', { name: 'Contract' }))

    expect(server.fetchBuilds).toHaveBeenCalledTimes(1)
    expect(server.fetchBuilds).toHaveBeenCalledWith('glue', {
      concept: 'part-model',
    })
    contract.getByRole('link', { name: 'Add the Part tables' })
  })

  it('reads in the section Build only the builds of the Project', async () => {
    const { server } = await renderPage('/glue/part-model?section=Build')

    expect(vi.mocked(server.fetchBuilds).mock.calls).toEqual([['glue']])
  })
})
