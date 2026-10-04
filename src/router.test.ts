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
import {
  findConcept,
  findPart,
  findProject,
  parts,
  projects,
} from './test/project.ts'

const session = {
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
}

function context(overrides: Partial<Server> = {}): Server {
  return {
    fetchSession: vi.fn(() => Promise.resolve(undefined)),
    fetchProjects: vi.fn(() => Promise.resolve(projects)),
    fetchProject: vi.fn((project) => Promise.resolve(findProject(project))),
    fetchConcept: vi.fn((input) => Promise.resolve(findConcept(input))),
    fetchParts: vi.fn((project) =>
      Promise.resolve(findProject(project) ? parts : []),
    ),
    fetchMine: vi.fn(() => Promise.resolve([])),
    fetchPart: vi.fn((input) => Promise.resolve(findPart(input))),
    fetchSignals: vi.fn(() => Promise.resolve({ signals: [], reason: null })),
    addSignalInsight: vi.fn(() =>
      Promise.resolve({ id: 'I1', issueMissing: false }),
    ),
    addProject: vi.fn(({ slug }) => Promise.resolve({ slug })),
    addConcept: vi.fn(({ concept }) => Promise.resolve({ slug: concept.slug })),
    addPart: vi.fn(() => Promise.resolve({ id: 'D5', issueMissing: false })),
    updatePart: vi.fn(({ recordId }) =>
      Promise.resolve({ id: recordId, issueMissing: false }),
    ),
    answerPart: vi.fn(({ recordId }) =>
      Promise.resolve({ id: recordId, issueMissing: false }),
    ),
    addJoint: vi.fn(() => Promise.resolve({ id: 1 })),
    removeJoint: vi.fn(() => Promise.resolve(undefined)),
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

type Router = Awaited<ReturnType<typeof open>>

function findMatch(router: Router, routeId: string) {
  return router.state.matches.find((match) => match.routeId === routeId)
}

const PROJECT = '/_signed-in/$project'
const CONCEPT = '/_signed-in/$project/$concept/'
const RECORD = '/_signed-in/$project/$concept/$recordId'

describe('a Project route without a session', () => {
  it('sends the start to sign-in', async () => {
    const location = await load('/', context())

    expect(location.pathname).toBe('/sign-in')
    expect(location.search).toEqual({})
  })

  it.each(['/flexibeck', '/flexibeck/cart', '/flexibeck/cart/D5'])(
    'sends %s to sign-in and keeps the page as the target',
    async (path) => {
      const location = await load(path, context())

      expect(location.pathname).toBe('/sign-in')
      expect(location.search).toEqual({ redirect: path })
    },
  )

  it('does not read the Project', async () => {
    const signedOut = context()

    await load('/', signedOut)
    await load('/glue', signedOut)
    await load('/glue/part-model', signedOut)
    await load('/glue/part-model/D4', signedOut)

    expect(signedOut.fetchProjects).not.toHaveBeenCalled()
    expect(signedOut.fetchProject).not.toHaveBeenCalled()
    expect(signedOut.fetchConcept).not.toHaveBeenCalled()
    expect(signedOut.fetchParts).not.toHaveBeenCalled()
    expect(signedOut.fetchPart).not.toHaveBeenCalled()
  })
})

describe('a Project route with a session', () => {
  const signedIn = (overrides: Partial<Server> = {}) =>
    context({
      fetchSession: vi.fn(() => Promise.resolve(session)),
      ...overrides,
    })

  it('shows the start of Glue at /', async () => {
    const server = signedIn()

    const location = await load('/', server)

    expect(location.pathname).toBe('/glue')
  })

  it('reads the Project, its Parts and its root Concept at the start of the Project', async () => {
    const server = signedIn()

    await load('/flexibeck', server)

    expect(server.fetchProjects).toHaveBeenCalledOnce()
    expect(server.fetchProject).toHaveBeenCalledExactlyOnceWith('flexibeck')
    expect(server.fetchParts).toHaveBeenCalledExactlyOnceWith('flexibeck')
    expect(server.fetchConcept).toHaveBeenCalledExactlyOnceWith({
      project: 'flexibeck',
      concept: 'flexibeck',
    })
  })

  it('reads the Concept in the path', async () => {
    const server = signedIn()

    const router = await open('/glue/part-model', server)

    expect(server.fetchConcept).toHaveBeenCalledExactlyOnceWith({
      project: 'glue',
      concept: 'part-model',
    })
    expect(findMatch(router, CONCEPT)?.meta).toContainEqual({
      title: 'Part model | Glue',
    })
  })

  it('reads the record with the Project and the id from the path', async () => {
    const server = signedIn()

    const router = await open('/glue/part-model/D4', server)

    expect(router.state.location.pathname).toBe('/glue/part-model/D4')
    expect(server.fetchPart).toHaveBeenCalledExactlyOnceWith({
      project: 'glue',
      recordId: 'D4',
    })
    expect(server.fetchConcept).not.toHaveBeenCalled()
    expect(findMatch(router, RECORD)?.meta).toContainEqual({
      title: 'D4 The Concept lives in the database | Glue',
    })
  })

  it.each([
    ['the address before the Part model', '/glue/concept/D4'],
    ['a Concept that is not the home of the record', '/glue/read-model/D4'],
  ])('sends %s to the record in its home Concept', async (_name, path) => {
    const location = await load(path, signedIn())

    expect(location.pathname).toBe('/glue/part-model/D4')
  })

  it('keeps the trail and the pins when it sends a record to its home Concept', async () => {
    const search = { section: 'Decide' as const, pins: ['I3'], trail: ['G1'] }
    const router = await open('/glue', signedIn())

    await router.navigate({
      to: '/$project/$concept/$recordId',
      params: { project: 'glue', concept: 'concept', recordId: 'D4' },
      search,
    })

    expect(router.state.location.pathname).toBe('/glue/part-model/D4')
    expect(router.state.location.search).toEqual(search)
  })

  it('reads the section, the pins and the trail from the address', async () => {
    const router = await open(
      `/glue/part-model/D4?section=Decide&pins=${encodeURIComponent('["I3","G1"]')}&trail=${encodeURIComponent('["R1"]')}`,
      signedIn(),
    )

    expect(findMatch(router, PROJECT)?.search).toEqual({
      section: 'Decide',
      pins: ['I3', 'G1'],
      trail: ['R1'],
    })
  })

  it('does not read a section or a record id that is none', async () => {
    const router = await open(
      `/glue?section=Nope&pins=${encodeURIComponent('["nope"]')}&trail=D4`,
      signedIn(),
    )

    expect(findMatch(router, PROJECT)?.search).toEqual({})
  })

  it.each(['/nope', '/nope/part-model', '/nope/part-model/D4'])(
    'has no page at %s, the path of a Project that Glue does not know',
    async (path) => {
      const router = await open(path, signedIn())

      const match = findMatch(router, PROJECT)

      expect(match?.status).toBe('notFound')
      expect(match?.meta).toContainEqual({ title: 'No Project nope | Glue' })
    },
  )

  it('has no page for a Concept that the Project does not have', async () => {
    const router = await open('/glue/nope', signedIn())

    const match = findMatch(router, CONCEPT)

    expect(findMatch(router, PROJECT)?.status).toBe('success')
    expect(match?.status).toBe('notFound')
    expect(match?.meta).toContainEqual({ title: 'No Concept nope | Glue' })
  })

  it('names the missing record in the tab title', async () => {
    const router = await open('/glue/part-model/D9', signedIn())

    const match = findMatch(router, RECORD)

    expect(match?.status).toBe('notFound')
    expect(match?.meta).toContainEqual({ title: 'No record D9 | Glue' })
  })

  it('names the record page in the tab title when it fails to load', async () => {
    const server = signedIn({
      fetchPart: vi.fn(() => Promise.reject(new Error('offline'))),
    })

    const router = await open('/glue/part-model/D4', server)

    expect(findMatch(router, RECORD)?.meta).toContainEqual({
      title: 'Unable to load the record | Glue',
    })
  })

  it('has no page at an address that is no Project, Concept or record', async () => {
    const router = await open('/glue/part-model/D4/more', signedIn())

    expect(findMatch(router, '/_signed-in/$')?.meta).toContainEqual({
      title: 'No page at this address | Glue',
    })
  })

  it.each([
    '/glue',
    '/glue/part-model',
    '/glue/part-model/D4',
    '/sign-in',
    '/sign-up',
  ])('shows %s with the stylesheet of the Carbon kit', async (path) => {
    const router = await open(
      path,
      path.startsWith('/sign') ? context() : signedIn(),
    )

    expect(findMatch(router, '__root__')?.links).toHaveLength(1)
  })

  it.each([
    ['/glue/part-model?add=decision', { add: 'decision' }],
    ['/glue/part-model?add=concept', { add: 'concept' }],
    ['/glue?add=project', { add: 'project' }],
    ['/glue/part-model/D4?edit=true', { edit: true }],
    ['/glue/part-model?add=record&edit=yes', {}],
  ])('reads the form of %s from the address', async (path, search) => {
    const router = await open(path, signedIn())

    expect(findMatch(router, PROJECT)?.search).toEqual(search)
  })

  it('has no page for the Decision form from before the Part model', async () => {
    const router = await open('/glue/decisions/new', signedIn())

    expect(findMatch(router, RECORD)?.status).toBe('notFound')
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

  function statuses(router: Router) {
    return router.state.matches.map((match) => [match.routeId, match.status])
  }

  function openRecord(router: Router) {
    return router.navigate({
      to: '/$project/$concept/$recordId',
      params: { project: 'glue', concept: 'part-model', recordId: 'D4' },
    })
  }

  it('comes from the server once, not on each navigation', async () => {
    const server = serverWithOneAnswer(offline)
    const router = await open('/', server)

    await openRecord(router)

    expect(router.state.location.pathname).toBe('/glue/part-model/D4')
    expect(server.fetchSession).toHaveBeenCalledOnce()
  })

  it('keeps the frame when the network fails, the error is at the record', async () => {
    const server = serverWithOneAnswer(offline, { fetchPart: vi.fn(offline) })
    const router = await open('/', server)

    await openRecord(router)

    expect(statuses(router)).toEqual([
      ['__root__', 'success'],
      ['/_signed-in', 'success'],
      [PROJECT, 'success'],
      [RECORD, 'error'],
    ])
  })

  it('keeps the record as the target when the session expires mid-navigation', async () => {
    const server = serverWithOneAnswer(offline, {
      fetchPart: vi.fn(() => Promise.reject(redirect({ to: '/sign-in' }))),
    })
    const router = await open('/', server)

    await openRecord(router)

    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({
      redirect: '/glue/concept/D4',
    })
  })

  it('comes with the page from the server, so the browser does not ask again', async () => {
    const server = context({ fetchSession: vi.fn(offline) })

    const router = await open('/glue/part-model/D4', server, { session })

    expect(router.state.location.pathname).toBe('/glue/part-model/D4')
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
    'sends %s to the start when there is a session',
    async (path) => {
      const signedIn = context({
        fetchSession: vi.fn(() => Promise.resolve(session)),
      })

      const location = await load(path, signedIn)

      expect(location.pathname).toBe('/glue')
    },
  )

  it.each(['/glue', '/glue/read-model', '/glue/part-model/D4'])(
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
    '/glue/evil.example',
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
