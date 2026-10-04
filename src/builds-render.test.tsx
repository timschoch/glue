// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createRouterContext } from './router-context.ts'
import type { Server } from './router-context.ts'
import { routeTree } from './routeTree.gen'
import {
  builds,
  findConcept,
  findContract,
  findContractState,
  findPart,
  findProject,
  parts,
  projects,
} from './test/project.ts'
import './test/render.tsx'

const session = {
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
}

const saved = { id: 'D4', issueMissing: false }

// The pages of Glue with a signed-in person. GitHub has two builds: one
// names the Decision D4, one names an old Contract Version of the Part model.
async function renderPage(path: string, overrides: Partial<Server> = {}) {
  const server: Server = {
    fetchSession: vi.fn(() => Promise.resolve(session)),
    fetchProjects: vi.fn(() => Promise.resolve(projects)),
    fetchProject: vi.fn((project) => Promise.resolve(findProject(project))),
    fetchConcept: vi.fn((input) => Promise.resolve(findConcept(input))),
    fetchParts: vi.fn((project) =>
      Promise.resolve(project === 'glue' ? parts : []),
    ),
    fetchPart: vi.fn((input) => Promise.resolve(findPart(input))),
    fetchMine: vi.fn(() => Promise.resolve([])),
    fetchSignals: vi.fn(() => Promise.resolve({ signals: [], reason: null })),
    fetchBuilds: vi.fn(() => Promise.resolve({ builds, reason: null })),
    addSignalInsight: vi.fn(() => Promise.resolve(saved)),
    fetchContractState: vi.fn((input) =>
      Promise.resolve(findContractState(input)),
    ),
    fetchContract: vi.fn((input) => Promise.resolve(findContract(input))),
    signContract: vi.fn(() => Promise.resolve({ version: 2 })),
    addProject: vi.fn(({ slug }) => Promise.resolve({ slug })),
    addConcept: vi.fn(({ concept }) => Promise.resolve({ slug: concept.slug })),
    addPart: vi.fn(() => Promise.resolve(saved)),
    updatePart: vi.fn(() => Promise.resolve(saved)),
    answerPart: vi.fn(() => Promise.resolve(saved)),
    addJoint: vi.fn(() => Promise.resolve({ id: 20 })),
    removeJoint: vi.fn(() => Promise.resolve(undefined)),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
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
    expect(within(open).getByText('Open')).toBeTruthy()
    expect(
      within(open).getByRole('link', { name: /D4/ }).getAttribute('href'),
    ).toBe('/glue/part-model/D4?section=Build')
    expect(within(open).queryByText('Stale')).toBeNull()
    expect(within(old).getByText('Merged')).toBeTruthy()
    expect(within(old).getByText('Stale')).toBeTruthy()
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

    expect(screen.getByText('The Project has no repository')).toBeTruthy()
  })

  it('reads no builds for a Concept without a Contract Version in another section', async () => {
    const { server } = await renderPage('/glue/flows?section=Decide')

    expect(server.fetchBuilds).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Builds' })).toBeNull()
  })

  it('shows on the record of a Decision the builds that name it', async () => {
    await renderPage('/glue/part-model/D4')

    expect(listed()).toEqual(['Read the Concept from the database'])
  })

  it('shows in the Contract of a Concept the builds that name it', async () => {
    await renderPage('/glue/part-model')

    const contract = within(screen.getByRole('region', { name: 'Contract' }))

    expect(
      contract.getByRole('link', { name: 'Add the Part tables' }),
    ).toBeTruthy()
    expect(
      contract.queryByRole('link', {
        name: 'Read the Concept from the database',
      }),
    ).toBeNull()
  })
})
