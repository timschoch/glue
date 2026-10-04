// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createRouterContext } from './router-context.ts'
import type { Server } from './router-context.ts'
import { routeTree } from './routeTree.gen'
import {
  decision,
  findConcept,
  findPart,
  findProject,
  parts,
  projects,
} from './test/project.ts'
import './test/render.tsx'

// jsdom has no layout, Carbon's dropdown scrolls to the highlighted item.
Element.prototype.scrollIntoView = () => {}

const session = {
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
}

const productConcept = {
  product: { slug: 'glue', name: 'Glue' },
  goals: [
    {
      id: 'G1',
      title: 'Agents build from the Concept',
      metric: 'Tickets',
      status: 'open' as const,
      latestValue: null,
    },
  ],
  decisions: [],
  guardrails: [
    { id: 'R1', title: 'No query over 200ms', enforcedBy: 'verify ci' },
  ],
  insights: [],
  facts: [],
}

const D4 = 'The Concept lives in the database'
const I3 = 'Agents read files'
const R1 = 'No query over 200ms'

// The pages of Glue with a signed-in person, and a server that saves the
// new Decision as D4.
async function renderPage(path: string) {
  const server: Server = {
    fetchSession: vi.fn(() => Promise.resolve(session)),
    fetchProjects: vi.fn(() => Promise.resolve(projects)),
    fetchProject: vi.fn((project) => Promise.resolve(findProject(project))),
    fetchConcept: vi.fn((input) => Promise.resolve(findConcept(input))),
    fetchParts: vi.fn((project) =>
      Promise.resolve(project === 'glue' ? parts : []),
    ),
    fetchPart: vi.fn((input) => Promise.resolve(findPart(input))),
    fetchProductConcept: vi.fn(() => Promise.resolve(productConcept)),
    fetchRecord: vi.fn(() => Promise.resolve(decision)),
    proposeDecision: vi.fn(() =>
      Promise.resolve({ id: 'D4', issueMissing: false }),
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

  // The path and the search of the address, when the screen shows them.
  async function expectAddress(pathname: string, search: object = {}) {
    await waitFor(() => {
      expect(router.state.status).toBe('idle')
      expect(router.state.location.pathname).toBe(pathname)
      expect(router.state.location.search).toEqual(search)
    })
  }

  return { expectAddress }
}

function pageTitle(): string | null {
  return screen.getByRole('heading', { level: 1 }).textContent
}

// The names of a navigation, in the order of the document.
function items(name: string): Array<string | null> {
  return within(screen.getByRole('navigation', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)
}

// The card of a record in the main window.
function card(recordId: string): HTMLElement {
  return within(screen.getByRole('main')).getByRole('link', {
    name: new RegExp(` ${recordId} `),
  })
}

// The record ids of the pinned cards, in the order of the column.
function pinned(): Array<string | undefined> {
  const column = screen.queryByRole('complementary', { name: 'Pinned' })
  if (!column) return []
  return within(column)
    .getAllByRole('link')
    .map((link) => /[A-Z]\d+/.exec(link.textContent)?.[0])
}

function section(name: string): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
    'link',
    { name },
  )
}

describe('the start of a Project', () => {
  it('shows the root Concept in the frame, with the Concepts of the Project in the left panel', async () => {
    await renderPage('/glue')

    const panel = within(screen.getByRole('navigation', { name: 'Main' }))

    expect(pageTitle()).toBe('Glue')
    expect(items('Breadcrumb')).toEqual(['Glue'])
    expect(items('Concepts')).toEqual(['Part model2 Parts', 'Flows0 Parts'])
    expect(card('G1')).toBeDefined()
    expect(
      panel.getByRole('combobox', { name: 'Project' }).firstChild?.textContent,
    ).toBe('Glue')
    expect(panel.getByRole('button', { name: 'Part model' })).toBeDefined()
    expect(panel.getByRole('link', { name: 'Flows' })).toBeDefined()
    expect(panel.queryByRole('link', { current: 'page' })).toBeNull()
  })

  it('has no trail, no pinned column and no button that writes', async () => {
    await renderPage('/glue/part-model')

    const main = within(screen.getByRole('main'))

    expect(screen.queryByRole('navigation', { name: 'Trail' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Pinned' })).toBeNull()
    expect(main.queryByRole('button')).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'Metrics' })).getByRole(
        'listitem',
      ).textContent,
    ).toBe('Metric')
  })

  it('opens a Concept with a click on its tile', async () => {
    const { expectAddress } = await renderPage('/glue')

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Concepts' })).getByRole(
        'link',
        { name: /Part model/ },
      ),
    )

    await expectAddress('/glue/part-model')
    expect(pageTitle()).toBe('Part model')
    expect(items('Breadcrumb')).toEqual(['Glue', 'Part model'])
  })

  it('marks the open Concept in the left panel and opens another one from it', async () => {
    const { expectAddress } = await renderPage('/glue/read-model')

    const panel = within(screen.getByRole('navigation', { name: 'Main' }))

    expect(
      panel
        .getAllByRole('link', { current: 'page' })
        .map((link) => link.textContent),
    ).toEqual(['Read model'])
    expect(items('Breadcrumb')).toEqual(['Glue', 'Part model', 'Read model'])

    await userEvent.click(panel.getByRole('link', { name: 'Flows' }))

    await expectAddress('/glue/flows')
    expect(pageTitle()).toBe('Flows')
  })

  it('goes back to the start of the Project from the breadcrumb', async () => {
    const { expectAddress } = await renderPage('/glue/read-model')

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'Glue' },
      ),
    )

    await expectAddress('/glue')
  })

  it('shows another Project after a choice in the switcher', async () => {
    const { expectAddress } = await renderPage(
      '/glue/part-model?section=Decide',
    )

    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }))
    await userEvent.click(screen.getByRole('option', { name: 'flexibeck' }))

    await expectAddress('/flexibeck')
    expect(pageTitle()).toBe('flexibeck')
  })

  it('names a Project that Glue does not know', async () => {
    await renderPage('/nope')

    expect(pageTitle()).toBe('No Project nope')
  })

  it('names a Concept that the Project does not have, in the frame', async () => {
    await renderPage('/glue/nope')

    expect(pageTitle()).toBe('No Concept nope')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeDefined()
  })
})

describe('a section', () => {
  it('shows only its Part types, and all types again after a second click', async () => {
    const { expectAddress } = await renderPage('/glue/part-model')

    const groups = () =>
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)

    expect(groups()).toEqual(['Insights', 'Goals', 'Decisions', 'Metrics'])

    await userEvent.click(section('Understand'))

    await expectAddress('/glue/part-model', { section: 'Understand' })
    expect(groups()).toEqual(['Insights'])
    expect(section('Understand').getAttribute('aria-current')).toBe('page')

    await userEvent.click(section('Understand'))

    await expectAddress('/glue/part-model')
    expect(groups()).toEqual(['Insights', 'Goals', 'Decisions', 'Metrics'])
  })

  it('goes from a record to its Concept, keeps the pins and ends the trail', async () => {
    const { expectAddress } = await renderPage(
      `/glue/part-model/D4?pins=${encodeURIComponent('["I3"]')}&trail=${encodeURIComponent('["R1"]')}`,
    )

    await userEvent.click(section('Decide'))

    await expectAddress('/glue/part-model', {
      section: 'Decide',
      pins: ['I3'],
    })
  })
})

describe('a record', () => {
  it('opens in the main window with a click on its card, as the start of a trail', async () => {
    const { expectAddress } = await renderPage(
      '/glue/part-model?section=Decide',
    )

    await userEvent.click(card('D4'))

    await expectAddress('/glue/part-model/D4', { section: 'Decide' })
    expect(pageTitle()).toBe(D4)
    expect(items('Trail')).toEqual([D4])
  })

  it('adds the record of a Joint to the trail, and goes back with a click on the trail', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/D4')

    await userEvent.click(card('R1'))

    await expectAddress('/glue/read-model/R1', { trail: ['D4'] })
    expect(pageTitle()).toBe(R1)
    expect(items('Trail')).toEqual([D4, R1])
    expect(items('Breadcrumb')).toEqual(['Glue', 'Part model', 'Read model'])

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Trail' })).getByRole(
        'link',
        { name: D4 },
      ),
    )

    await expectAddress('/glue/part-model/D4')
    expect(items('Trail')).toEqual([D4])
  })

  it('opens the record of a record id in its text', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/D4')

    const main = within(screen.getByRole('main'))

    expect(main.queryByRole('link', { name: '#D9' })).toBeNull()

    await userEvent.click(main.getByRole('link', { name: '#I3' }))

    await expectAddress('/glue/part-model/I3', { trail: ['D4'] })
    expect(pageTitle()).toBe(I3)
  })

  it('names the home Concept on the card of a Part that a link glues', async () => {
    await renderPage('/glue/part-model/D4')

    expect(card('G1').textContent).toContain('Glue')
    expect(card('I3').textContent).not.toContain('Part model')
  })

  it('stacks the pinned records in the right column, the newest at the top', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/D4')

    expect(pinned()).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))

    await expectAddress('/glue/part-model/D4', { pins: ['D4'] })
    expect(pinned()).toEqual(['D4'])
    expect(
      screen.getByRole('button', { name: 'Pin' }).getAttribute('aria-pressed'),
    ).toBe('true')

    await userEvent.click(card('I3'))
    await expectAddress('/glue/part-model/I3', { pins: ['D4'], trail: ['D4'] })
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))

    await expectAddress('/glue/part-model/I3', {
      pins: ['I3', 'D4'],
      trail: ['D4'],
    })
    expect(pinned()).toEqual(['I3', 'D4'])
  })

  it('takes a pin away from its card, and the column with the last pin', async () => {
    const { expectAddress } = await renderPage(
      `/glue/part-model?pins=${encodeURIComponent('["I3","D4"]')}`,
    )
    const unpin = () =>
      within(
        screen.getByRole('complementary', { name: 'Pinned' }),
      ).getAllByRole('button')[0]

    await userEvent.click(unpin())

    await expectAddress('/glue/part-model', { pins: ['D4'] })
    expect(pinned()).toEqual(['D4'])

    await userEvent.click(unpin())

    await expectAddress('/glue/part-model')
    expect(pinned()).toEqual([])
  })

  it('opens from its pinned card and joins the trail', async () => {
    const { expectAddress } = await renderPage(
      `/glue/part-model/D4?pins=${encodeURIComponent('["R1"]')}`,
    )

    await userEvent.click(
      within(screen.getByRole('complementary', { name: 'Pinned' })).getByRole(
        'link',
      ),
    )

    await expectAddress('/glue/read-model/R1', { pins: ['R1'], trail: ['D4'] })
  })

  it('leaves a click with a modifier key to the browser', async () => {
    const { expectAddress } = await renderPage('/glue/part-model')

    fireEvent.click(card('D4'), { metaKey: true })

    await expectAddress('/glue/part-model')
  })

  it('names a record that the Project does not have, in the frame', async () => {
    await renderPage('/glue/part-model/D9')

    expect(pageTitle()).toBe('No record D9')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeDefined()
  })
})

describe('the Decision form after the save', () => {
  it('shows the record of the new Decision', async () => {
    const { expectAddress } = await renderPage(
      '/glue/decisions/new?evidence=R1',
    )
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Title' }),
      D4,
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Goal' }),
      'G1',
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    await expectAddress('/glue/part-model/D4')
    expect(pageTitle()).toBe(D4)
  })

  it('shows the record of the Decision that supersedes', async () => {
    const { expectAddress } = await renderPage(
      '/glue/decisions/new?supersedes=D4',
    )
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Title' }),
      ' now',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Supersede D4' }))

    await expectAddress('/glue/part-model/D4')
  })
})
