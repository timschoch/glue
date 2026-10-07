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
import { builds, parts } from './test/project.ts'
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

function next() {
  return within(screen.getByRole('region', { name: 'Next' }))
}

// The current step of the flow of the Concept.
function currentStep() {
  return within(screen.getByRole('list', { name: 'Concept to build' }))
    .getAllByRole('button')
    .find((step) => step.getAttribute('aria-current') === 'step')?.title
}

// The Part model with its Contract Version 1 and nothing after it.
const signed: Partial<Server> = {
  fetchContractState: vi.fn(() =>
    Promise.resolve({
      versions: [
        {
          version: 1,
          checksum: '9f2c4e7a1b3d',
          signedBy: 'Ada',
          signedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
      ahead: false,
      blocking: [],
      emptySlots: [],
    }),
  ),
}

describe('the common flow of a Concept', () => {
  it('shows the step bar above the box Next, and opens the form of the empty slot', async () => {
    const { router } = await renderPage('/glue/part-model', {
      fetchContractState: vi.fn(() =>
        Promise.resolve({
          versions: [],
          ahead: false,
          blocking: [],
          emptySlots: [{ type: 'metric' as const, count: 0, minCount: 1 }],
        }),
      ),
    })

    expect(currentStep()).toBe('Fill slots')
    expect(
      screen.getByRole('region', { name: 'Next' }).previousElementSibling,
    ).toBe(screen.getByRole('list', { name: 'Concept to build' }))

    await userEvent.click(next().getByRole('button', { name: 'Add Metric' }))

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ add: 'metric' })
    })
  })

  it('signs off the Concept with each slot filled, then reads the Contract again', async () => {
    const { server } = await renderPage('/glue/part-model')

    expect(currentStep()).toBe('Sign')

    await userEvent.click(next().getByRole('button', { name: 'Sign off' }))

    expect(server.signContract).toHaveBeenCalledWith({
      project: 'glue',
      concept: 'part-model',
    })
    await waitFor(() => {
      expect(server.fetchContractState).toHaveBeenCalledTimes(2)
    })
  })

  it('says that it signs off while the sign-off saves', async () => {
    await renderPage('/glue/part-model', {
      signContract: vi.fn(() => new Promise<{ version: number }>(() => {})),
    })

    await userEvent.click(next().getByRole('button', { name: 'Sign off' }))

    await next().findByText('Signing off')
    expect(next().queryByRole('button')).toBeNull()
  })

  it('shows why the sign-off failed', async () => {
    await renderPage('/glue/part-model', {
      signContract: vi.fn(() =>
        Promise.resolve({ message: 'sign-off needs Trust solid: D4' }),
      ),
    })

    await userEvent.click(next().getByRole('button', { name: 'Sign off' }))

    expect((await next().findByRole('alert')).textContent).toContain(
      'sign-off needs Trust solid: D4',
    )
  })

  it('opens the Contract Version that waits for its build', async () => {
    const { router } = await renderPage('/glue/part-model', signed)

    expect(currentStep()).toBe('Build')

    await userEvent.click(
      next().getByRole('button', { name: 'Open Version 1' }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/glue/part-model/contract/1')
    })
  })

  it('links to the build whose gate breaks', async () => {
    await renderPage('/glue/part-model', {
      ...signed,
      fetchBuilds: vi.fn(() =>
        Promise.resolve({ builds: [builds[1]], reason: null }),
      ),
    })

    const link = next().getByRole('link', { name: 'Open build 11' })

    expect(currentStep()).toBe('Gate')
    expect(link.getAttribute('href')).toBe(
      'https://github.com/timschoch/glue/pull/11',
    )
    expect(link.querySelectorAll('svg')).toHaveLength(1)
  })

  it('has each step done and no box Next when the gate of the build holds', async () => {
    await renderPage('/glue/part-model', {
      ...signed,
      fetchBuilds: vi.fn(() =>
        Promise.resolve({
          builds: [
            {
              ...builds[1],
              gate: {
                result: 'holds' as const,
                reasons: [],
                guardrails: [],
                checkedAt: '2026-10-05T09:00:00.000Z',
              },
            },
          ],
          reason: null,
        }),
      ),
    })

    expect(currentStep()).toBeUndefined()
    screen.getByRole('list', { name: 'Concept to build' })
    expect(screen.queryByRole('heading', { name: 'Next' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Next' })).toBeNull()
  })

  it('opens the Decision of the shipped build that no Insight needs', async () => {
    const { router } = await renderPage('/glue/part-model', {
      ...signed,
      fetchBuilds: vi.fn(() =>
        Promise.resolve({
          builds: [
            { ...builds[1], gate: builds[0].gate, decisions: [parts[2]] },
          ],
          reason: null,
        }),
      ),
    })

    screen.getByRole('list', { name: 'Use to Insight' })

    await userEvent.click(
      next().getByRole('button', {
        name: 'Open D4 The Concept lives in the database',
      }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/glue/part-model/D4')
    })
  })

  it('has no flow for a Concept with nothing to sign', async () => {
    await renderPage('/glue/flows')

    expect(screen.queryByRole('region', { name: 'Next' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Concept to build' })).toBeNull()
  })
})

describe('the Contract on the Concept screen', () => {
  it('shows the Contract Version with its checksum, and the mark of a Concept that is ahead', async () => {
    await renderPage('/glue/part-model')

    expect(contract().getByRole('link').textContent).toBe(
      'Version 1 9f2c4e7a1b3d Ada 2026-10-01',
    )
    contract().getByText('Ahead')
  })

  it('shows the Parts that block, and the next step opens the first one', async () => {
    const { router } = await renderPage('/glue', {
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
    expect(screen.queryByRole('button', { name: 'Sign off' })).toBeNull()

    await userEvent.click(
      next().getByRole('button', {
        name: 'Open G1 Agents build from the Concept',
      }),
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/glue/glue/G1')
    })
  })

  it('has no Contract before the first sign-off: the step is in the box Next', async () => {
    await renderPage('/glue/read-model')

    next().getByRole('button', { name: 'Sign off' })
    expect(screen.queryByRole('region', { name: 'Contract' })).toBeNull()
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
