// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Decision } from './db/concept.ts'
import { createRouterContext } from './router-context.ts'
import type { Server } from './router-context.ts'
import { routeTree } from './routeTree.gen'
import './test/render.tsx'

afterEach(cleanup)

const session = {
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
}

const concept = {
  product: { slug: 'glue', name: 'Glue' },
  goals: [
    { id: 'G1', title: 'Agents build from the Concept', metric: 'Tickets' },
  ],
  decisions: [],
  guardrails: [],
  insights: [],
  facts: [{ id: 'F1', title: 'An export is one request' }],
}

const oldDecision: Decision = {
  kind: 'decision',
  id: 'D4',
  title: 'The Concept lives in files',
  date: '2026-01-15',
  owner: 'Grace',
  status: 'accepted',
  body: '',
  goal: { id: 'G1', title: 'Agents build from the Concept' },
  evidence: [{ id: 'F1', title: 'An export is one request' }],
  supersededBy: null,
  supersedes: [],
  issueUrl: null,
}

const newDecision: Decision = {
  ...oldDecision,
  id: 'D5',
  title: 'The Concept lives in the database',
}

// The pages of Glue with a signed-in person, and a server that saves the
// new Decision as D5.
async function renderPage(path: string) {
  const server: Server = {
    fetchSession: vi.fn(() => Promise.resolve(session)),
    fetchProducts: vi.fn(() =>
      Promise.resolve([{ slug: 'glue', name: 'Glue' }]),
    ),
    fetchConcept: vi.fn(() => Promise.resolve(concept)),
    fetchRecord: vi.fn(({ recordId }) =>
      Promise.resolve(recordId === 'D4' ? oldDecision : newDecision),
    ),
    keepInsight: vi.fn(() => Promise.resolve(undefined)),
    discardInsight: vi.fn(() => Promise.resolve(undefined)),
    acceptDecision: vi.fn(() =>
      Promise.resolve({ id: 'D5', issueMissing: false }),
    ),
    proposeDecision: vi.fn(() =>
      Promise.resolve({ id: 'D5', issueMissing: false }),
    ),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
  }
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: createRouterContext(server),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

async function expectResult(message: string) {
  const title = await screen.findByRole('heading', {
    level: 1,
    name: 'D5 The Concept lives in the database',
  })
  await waitFor(() => expect(document.activeElement).toBe(title))
  expect(screen.getByRole('status').textContent).toBe(message)
}

describe('the Decision form after the save', () => {
  it('says that the Decision is proposed and moves the focus to its title', async () => {
    await renderPage('/glue/decisions/new?evidence=F1')
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Title' }),
      'The Concept lives in the database',
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Goal' }),
      'G1',
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    await expectResult('Proposed D5.')
  })

  it('says which Decision is superseded and moves the focus to the title', async () => {
    await renderPage('/glue/decisions/new?supersedes=D4')
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Title' }),
      ' now',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Supersede D4' }))

    await expectResult('Accepted D5, superseded D4.')
  })
})
