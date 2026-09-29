// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import type { RouterContext } from './router-context.ts'
import { routeTree } from './routeTree.gen'

const session = {
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
}

const concept = {
  product: { slug: 'glue', name: 'Glue' },
  goals: [],
  decisions: [],
  guardrails: [],
  insights: [],
  facts: [],
}

const guardrail = {
  kind: 'guardrail' as const,
  id: 'R1',
  title: 'No query over 200ms',
  enforcedBy: 'none yet',
  body: '',
}

function context(overrides: Partial<RouterContext> = {}): RouterContext {
  return {
    fetchSession: vi.fn(() => Promise.resolve(undefined)),
    fetchConcept: vi.fn(() => Promise.resolve(concept)),
    fetchRecord: vi.fn(() => Promise.resolve(guardrail)),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

async function load(path: string, routerContext: RouterContext) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: routerContext,
  })
  await router.load()
  return router.state.location
}

describe('a Concept route without a session', () => {
  it('sends the overview to sign-in', async () => {
    const location = await load('/', context())

    expect(location.pathname).toBe('/sign-in')
    expect(location.search).toEqual({})
  })

  it('sends a record page to sign-in and keeps the record as the target', async () => {
    const location = await load('/concept/D5', context())

    expect(location.pathname).toBe('/sign-in')
    expect(location.search).toEqual({ redirect: '/concept/D5' })
  })

  it('does not read the Concept', async () => {
    const signedOut = context()

    await load('/', signedOut)
    await load('/concept/D5', signedOut)

    expect(signedOut.fetchConcept).not.toHaveBeenCalled()
    expect(signedOut.fetchRecord).not.toHaveBeenCalled()
  })
})

describe('a Concept route with a session', () => {
  const signedIn = () =>
    context({ fetchSession: vi.fn(() => Promise.resolve(session)) })

  it('shows the overview at /', async () => {
    const routerContext = signedIn()

    const location = await load('/', routerContext)

    expect(location.pathname).toBe('/')
    expect(routerContext.fetchConcept).toHaveBeenCalledOnce()
  })

  it('reads the record with the id from the path', async () => {
    const routerContext = signedIn()

    const location = await load('/concept/R1', routerContext)

    expect(location.pathname).toBe('/concept/R1')
    expect(routerContext.fetchRecord).toHaveBeenCalledWith('R1')
  })
})

describe('the sign-in and sign-up routes', () => {
  it.each(['/sign-in', '/sign-up'])(
    'shows %s without a session',
    async (path) => {
      const location = await load(path, context())

      expect(location.pathname).toBe(path)
    },
  )

  it.each(['/sign-in', '/sign-up'])(
    'sends %s to the overview when there is a session',
    async (path) => {
      const signedIn = context({
        fetchSession: vi.fn(() => Promise.resolve(session)),
      })

      const location = await load(path, signedIn)

      expect(location.pathname).toBe('/')
    },
  )

  it('sends a signed-in person to the target of the redirect', async () => {
    const signedIn = context({
      fetchSession: vi.fn(() => Promise.resolve(session)),
    })

    const location = await load('/sign-in?redirect=%2Fconcept%2FD5', signedIn)

    expect(location.pathname).toBe('/concept/D5')
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/concept/D5/../../sign-up',
    '/concept/https://evil.example',
  ])('does not follow the redirect %s to another site', async (target) => {
    const signedIn = context({
      fetchSession: vi.fn(() => Promise.resolve(session)),
    })

    const location = await load(
      `/sign-in?redirect=${encodeURIComponent(target)}`,
      signedIn,
    )

    expect(location.pathname).toBe('/')
  })
})
