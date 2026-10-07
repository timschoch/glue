// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createRouterContext } from './router-context.ts'
import type { Server } from './router-server.ts'
import { routeTree } from './routeTree.gen'
import { parts } from './test/project.ts'
import './test/render.tsx'
import { createMemoryServer } from './test/server.ts'

// The pages of Glue with a signed-in person. The Part model has one Contract
// Version and is ahead of it.
async function renderPage(path: string, overrides: Partial<Server> = {}) {
  const server = createMemoryServer(overrides)
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: createRouterContext(server),
  })
  await router.load()
  render(<RouterProvider router={router} />)

  return { router, server }
}

function contract() {
  return within(screen.getByRole('region', { name: 'Contract' }))
}

describe('the Contract on the Concept screen', () => {
  it('shows the Contract Version with its checksum, and the mark of a Concept that is ahead', async () => {
    await renderPage('/glue/part-model')

    expect(contract().getByRole('link').textContent).toBe(
      'Version 1 9f2c4e7a1b3d Ada 2026-10-01',
    )
    contract().getByText('Ahead')
  })

  it('signs off the Concept, then reads the Contract again', async () => {
    const { server } = await renderPage('/glue/part-model')

    await userEvent.click(contract().getByRole('button', { name: 'Sign off' }))

    expect(server.signContract).toHaveBeenCalledWith({
      project: 'glue',
      concept: 'part-model',
    })
    await waitFor(() => {
      expect(server.fetchContractState).toHaveBeenCalledTimes(2)
    })
  })

  it('shows why the sign-off failed', async () => {
    await renderPage('/glue/part-model', {
      signContract: vi.fn(() =>
        Promise.resolve({ message: 'sign-off needs Trust solid: D4' }),
      ),
    })

    await userEvent.click(contract().getByRole('button', { name: 'Sign off' }))

    expect((await contract().findByRole('alert')).textContent).toContain(
      'sign-off needs Trust solid: D4',
    )
  })

  it('shows the Parts that block, and each one opens its record', async () => {
    await renderPage('/glue', {
      fetchContractState: vi.fn(() =>
        Promise.resolve({
          versions: [],
          ahead: false,
          blocking: [{ ...parts[1], trust: 'flagged' as const }],
          emptySlots: [],
        }),
      ),
    })

    const blocking = within(contract().getByRole('list', { name: 'Blocking' }))

    expect(
      blocking.getByRole('link', { name: / G1 / }).getAttribute('href'),
    ).toBe('/glue/glue/G1')
    expect(
      contract().getByRole<HTMLButtonElement>('button', { name: 'Sign off' })
        .disabled,
    ).toBe(true)
  })

  it('has no Contract for a Concept with nothing to sign', async () => {
    await renderPage('/glue/flows')

    expect(screen.queryByRole('region', { name: 'Contract' })).toBeNull()
  })
})

describe('the screen of a Contract Version', () => {
  it('opens from its row, and shows the frozen Parts and the empty slots', async () => {
    const { router } = await renderPage('/glue/part-model')

    await userEvent.click(contract().getByRole('link'))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/glue/part-model/contract/1')
    })
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('heading', { level: 1 }).textContent).toBe(
      'Part model',
    )
    main.getByText('Contract Version 1')
    expect(
      main
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Agents read files', 'The Concept lives in the database'])
    within(main.getByRole('list', { name: 'Empty slots' })).getByText('Metric')
    expect(document.title).toBe('Part model Version 1 | Glue')
  })

  it.each(['9', 'one'])('has no Version %s', async (version) => {
    await renderPage(`/glue/part-model/contract/${version}`)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      `No Contract Version ${version}`,
    )
  })
})
