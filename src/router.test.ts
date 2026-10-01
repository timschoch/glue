// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import { createRouterContext } from './router-context.ts'
import type { RouterContext, Server, SessionMemory } from './router-context.ts'
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

const decision = {
  kind: 'decision' as const,
  id: 'D4',
  title: 'The Concept lives in the database',
  date: '2026-01-15',
  owner: 'Ada',
  status: 'accepted' as const,
  body: '',
  goal: { id: 'G1', title: 'Agents build from the Concept' },
  evidence: [],
  supersededBy: null,
  supersedes: [],
  issueUrl: null,
}

const products = [
  { slug: 'flexibeck', name: 'flexibeck' },
  { slug: 'glue', name: 'Glue' },
]

function context(overrides: Partial<Server> = {}): Server {
  return {
    fetchSession: vi.fn(() => Promise.resolve(undefined)),
    fetchProducts: vi.fn(() => Promise.resolve(products)),
    fetchConcept: vi.fn(() => Promise.resolve(concept)),
    fetchRecord: vi.fn(() => Promise.resolve(guardrail)),
    keepInsight: vi.fn(() => Promise.resolve(undefined)),
    discardInsight: vi.fn(() => Promise.resolve(undefined)),
    acceptDecision: vi.fn(() =>
      Promise.resolve({ id: 'D1', issueMissing: false }),
    ),
    updateGoal: vi.fn(() => Promise.resolve(undefined)),
    proposeDecision: vi.fn(() =>
      Promise.resolve({ id: 'D1', issueMissing: false }),
    ),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

async function open(path: string, server: Server, memory?: SessionMemory) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: createRouterContext(server, memory),
  })
  await router.load()
  return router
}

async function load(path: string, server: Server) {
  const router = await open(path, server)
  return router.state.location
}

describe('a Concept route without a session', () => {
  it('sends the overview to sign-in', async () => {
    const location = await load('/', context())

    expect(location.pathname).toBe('/sign-in')
    expect(location.search).toEqual({})
  })

  it.each(['/flexibeck', '/flexibeck/concept/D5'])(
    'sends %s to sign-in and keeps the page as the target',
    async (path) => {
      const location = await load(path, context())

      expect(location.pathname).toBe('/sign-in')
      expect(location.search).toEqual({ redirect: path })
    },
  )

  it('does not read the Concept', async () => {
    const signedOut = context()

    await load('/', signedOut)
    await load('/glue', signedOut)
    await load('/glue/concept/D5', signedOut)
    await load('/glue/decisions/new', signedOut)

    expect(signedOut.fetchProducts).not.toHaveBeenCalled()
    expect(signedOut.fetchConcept).not.toHaveBeenCalled()
    expect(signedOut.fetchRecord).not.toHaveBeenCalled()
  })
})

describe('a Concept route with a session', () => {
  const signedIn = () =>
    context({ fetchSession: vi.fn(() => Promise.resolve(session)) })

  it('shows the overview of Glue at /', async () => {
    const routerContext = signedIn()

    const location = await load('/', routerContext)

    expect(location.pathname).toBe('/glue')
    expect(routerContext.fetchConcept).toHaveBeenCalledExactlyOnceWith('glue')
  })

  it('shows the overview of the Product in the path', async () => {
    const routerContext = signedIn()

    const location = await load('/flexibeck', routerContext)

    expect(location.pathname).toBe('/flexibeck')
    expect(routerContext.fetchConcept).toHaveBeenCalledExactlyOnceWith(
      'flexibeck',
    )
  })

  it('reads the record with the Product and the id from the path', async () => {
    const routerContext = signedIn()

    const location = await load('/flexibeck/concept/R1', routerContext)

    expect(location.pathname).toBe('/flexibeck/concept/R1')
    expect(routerContext.fetchRecord).toHaveBeenCalledWith({
      product: 'flexibeck',
      recordId: 'R1',
    })
  })

  type Router = Awaited<ReturnType<typeof open>>

  function findMatch(router: Router, routeId: string) {
    return router.state.matches.find((match) => match.routeId === routeId)
  }

  function recordMatch(router: Router) {
    return findMatch(router, '/_signed-in/$product/concept/$recordId')
  }

  it.each(['/nope', '/nope/concept/R1', '/nope/decisions/new'])(
    'has no page at %s, the path of a Product that Glue does not know',
    async (path) => {
      const router = await open(path, signedIn())

      const match = findMatch(router, '/_signed-in/$product')

      expect(match?.status).toBe('notFound')
      expect(match?.meta).toContainEqual({ title: 'No Product nope | Glue' })
    },
  )

  it('opens the Decision form with the Insight from the address as evidence', async () => {
    const routerContext = signedIn()

    const location = await load(
      '/flexibeck/decisions/new?evidence=I3',
      routerContext,
    )

    expect(location.search).toEqual({ evidence: 'I3' })
    expect(routerContext.fetchConcept).toHaveBeenCalledWith('flexibeck')
    expect(routerContext.fetchRecord).not.toHaveBeenCalled()
  })

  it('reads the Decision that the form supersedes', async () => {
    const routerContext = signedIn()
    routerContext.fetchRecord = vi.fn(() => Promise.resolve(decision))

    const router = await open(
      '/glue/decisions/new?supersedes=D4',
      routerContext,
    )

    expect(routerContext.fetchRecord).toHaveBeenCalledWith({
      product: 'glue',
      recordId: 'D4',
    })
    expect(
      findMatch(router, '/_signed-in/$product/decisions/new')?.status,
    ).toBe('success')
  })

  it('shows the record, not the form, for a Decision that is superseded already', async () => {
    const routerContext = signedIn()
    routerContext.fetchRecord = vi.fn(() =>
      Promise.resolve({
        ...decision,
        status: 'superseded' as const,
        supersededBy: { id: 'D5', title: 'The Concept lives in files' },
      }),
    )

    const location = await load(
      '/glue/decisions/new?supersedes=D4',
      routerContext,
    )

    expect(location.pathname).toBe('/glue/concept/D4')
  })

  it.each([
    ['issue=missing', { issue: 'missing' }],
    ['issue=nope', {}],
  ])('reads %s from the address of a record', async (search, expected) => {
    const router = await open(`/glue/concept/R1?${search}`, signedIn())

    expect(recordMatch(router)?.search).toEqual(expected)
  })

  it('has no Decision form for a Decision that the Concept does not have', async () => {
    const routerContext = signedIn()
    routerContext.fetchRecord = vi.fn(() => Promise.resolve(undefined))

    const router = await open(
      '/glue/decisions/new?supersedes=D9',
      routerContext,
    )

    expect(
      findMatch(router, '/_signed-in/$product/decisions/new')?.status,
    ).toBe('notFound')
  })

  it.each(['evidence=nope', 'supersedes=I3'])(
    'does not give %s from the address to the Decision form',
    async (search) => {
      const routerContext = signedIn()

      const router = await open(`/glue/decisions/new?${search}`, routerContext)

      expect(
        findMatch(router, '/_signed-in/$product/decisions/new')?.search,
      ).toEqual({})
      expect(routerContext.fetchRecord).not.toHaveBeenCalled()
    },
  )

  it('names the missing record in the tab title', async () => {
    const routerContext = signedIn()
    routerContext.fetchRecord = vi.fn(() => Promise.resolve(undefined))

    const router = await open('/glue/concept/D9', routerContext)

    expect(recordMatch(router)?.meta).toContainEqual({
      title: 'No record D9 | Glue',
    })
  })

  it('names the record page in the tab title when it fails to load', async () => {
    const routerContext = signedIn()
    routerContext.fetchRecord = vi.fn(() =>
      Promise.reject(new Error('offline')),
    )

    const router = await open('/glue/concept/R1', routerContext)

    expect(recordMatch(router)?.meta).toContainEqual({
      title: 'Unable to load the record | Glue',
    })
  })
})

describe('the session of a signed-in person', () => {
  const offline = () => Promise.reject(new Error('offline'))
  const credentials = { email: 'ada@example.com', password: 'correct horse' }

  // A server that knows the session for the first request only.
  function serverWithOneAnswer(
    next: Server['fetchSession'],
    overrides: Partial<Server> = {},
  ) {
    return context({
      fetchSession: vi
        .fn<Server['fetchSession']>()
        .mockResolvedValueOnce(session)
        .mockImplementation(next),
      ...overrides,
    })
  }

  function statuses(router: Awaited<ReturnType<typeof open>>) {
    return router.state.matches.map((match) => [match.routeId, match.status])
  }

  function openRecord(router: Awaited<ReturnType<typeof open>>) {
    return router.navigate({
      to: '/$product/concept/$recordId',
      params: { product: 'glue', recordId: 'R1' },
    })
  }

  it('comes from the server once, not on each navigation', async () => {
    const server = serverWithOneAnswer(offline)
    const router = await open('/', server)

    await openRecord(router)

    expect(router.state.location.pathname).toBe('/glue/concept/R1')
    expect(server.fetchSession).toHaveBeenCalledOnce()
  })

  it('keeps the page frame when the network fails, the error is at the record', async () => {
    const server = serverWithOneAnswer(offline, {
      fetchProducts: vi
        .fn<Server['fetchProducts']>()
        .mockResolvedValueOnce(products)
        .mockImplementation(offline),
      fetchRecord: vi.fn(offline),
    })
    const router = await open('/', server)

    await openRecord(router)

    expect(statuses(router)).toEqual([
      ['__root__', 'success'],
      ['/_signed-in', 'success'],
      ['/_signed-in/$product', 'success'],
      ['/_signed-in/$product/concept/$recordId', 'error'],
    ])
  })

  it('keeps the record as the target when the session expires mid-navigation', async () => {
    const server = serverWithOneAnswer(offline, {
      fetchRecord: vi.fn(() => Promise.reject(redirect({ to: '/sign-in' }))),
    })
    const router = await open('/', server)

    await openRecord(router)

    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({
      redirect: '/glue/concept/R1',
    })
  })

  it('comes with the page from the server, so the browser does not ask again', async () => {
    const server = context({ fetchSession: vi.fn(offline) })

    const router = await open('/glue/concept/R1', server, { session })

    expect(router.state.location.pathname).toBe('/glue/concept/R1')
    expect(server.fetchSession).not.toHaveBeenCalled()
  })

  it.each([
    ['sign-in', (routes: RouterContext) => routes.signIn(credentials)],
    [
      'sign-up',
      (routes: RouterContext) => routes.signUp({ name: 'Ada', ...credentials }),
    ],
    ['sign-out', (routes: RouterContext) => routes.signOut()],
  ])('comes from the server again after a %s', async (_name, change) => {
    const server = serverWithOneAnswer(() => Promise.resolve(undefined))
    const router = await open('/', server)

    await change(router.options.context)
    await openRecord(router)

    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('does not send the person away from sign-in after the session ended', async () => {
    const server = serverWithOneAnswer(() => Promise.resolve(undefined))
    const router = await open('/', server)

    await router.navigate({ to: '/sign-in' })

    expect(router.state.location.pathname).toBe('/sign-in')
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

      expect(location.pathname).toBe('/glue')
    },
  )

  it.each(['/flexibeck', '/flexibeck/concept/D5'])(
    'sends a signed-in person to %s, the target of the redirect',
    async (target) => {
      const signedIn = context({
        fetchSession: vi.fn(() => Promise.resolve(session)),
      })

      const location = await load(
        `/sign-in?redirect=${encodeURIComponent(target)}`,
        signedIn,
      )

      expect(location.pathname).toBe(target)
    },
  )

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/glue/concept/D5/../../sign-up',
    '/glue/concept/https://evil.example',
    '/glue//evil.example',
    '/evil.example',
  ])('does not follow the redirect %s to another site', async (target) => {
    const signedIn = context({
      fetchSession: vi.fn(() => Promise.resolve(session)),
    })

    const location = await load(
      `/sign-in?redirect=${encodeURIComponent(target)}`,
      signedIn,
    )

    expect(location.pathname).toBe('/glue')
  })
})
