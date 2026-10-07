// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Ask } from './db/asks.ts'
import type { LeveledPart } from './db/flight-level.ts'
import type {
  MeasuredPart,
  Part,
  PartMeasure,
  PartSummary,
} from './db/parts.ts'
import { createRouterContext } from './router-context.ts'
import type { Server } from './router-server.ts'
import { routeTree } from './routeTree.gen'
import { findPart, OLD_TITLE, parts, people } from './test/project.ts'
import './test/render.tsx'
import { createMemoryServer } from './test/server.ts'

// jsdom has no layout, Carbon's dropdown scrolls to the highlighted item.
Element.prototype.scrollIntoView = () => {}

// The Signals of Glue: one grew into I3, one grew into nothing yet.
const signals = [
  {
    url: 'https://github.com/timschoch/glue/issues/7',
    title: 'The list is slow',
    text: 'It takes five seconds to open.',
    date: '2026-10-02',
    source: 'github',
    insight: null,
  },
  {
    url: 'https://github.com/timschoch/glue/issues/5',
    title: 'Agents open each file',
    text: '',
    date: '2026-10-01',
    source: 'github',
    insight: { id: 'I3', title: 'Agents read files' },
  },
]

const D4 = 'The Concept lives in the database'
const I3 = 'Agents read files'
const R1 = 'No query over 200ms'

// A record of Glue with other values, as the server gives it.
function changedPart(recordId: string, changed: Partial<Part>) {
  return (input: { project: string; recordId: string }) => {
    const part = findPart(input)
    return Promise.resolve(
      part && input.recordId === recordId ? { ...part, ...changed } : part,
    )
  }
}

// A server for a person who is not signed in.
const signedOut = () => ({
  fetchSession: vi.fn(() => Promise.resolve(undefined)),
})

// The pages of Glue with a signed-in person, and a server that saves each
// write.
async function renderPage(path: string, changed: Partial<Server> = {}) {
  const server = createMemoryServer({
    fetchSignals: vi.fn(() =>
      Promise.resolve({ signals, failures: [], groups: [] }),
    ),
    ...changed,
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: createRouterContext(server),
  })
  await router.load()
  // The root route renders the document, as in the browser. In a container
  // below the body, React does not find the root of an event from a menu
  // that Carbon puts into the body.
  render(<RouterProvider router={router} />, { container: document })

  // The path and the search of the address, when the screen shows them.
  async function expectAddress(pathname: string, search: object = {}) {
    await waitFor(() => {
      expect(router.state.status).toBe('idle')
      expect(router.state.location.pathname).toBe(pathname)
      expect(router.state.location.search).toEqual(search)
    })
  }

  return { expectAddress, server }
}

function button(name: string | RegExp): HTMLElement {
  return within(screen.getByRole('main')).getByRole('button', { name })
}

// The texts of the error notifications on the screen, each after the name
// of its icon. Carbon has empty alerts in its text fields.
function alerts(): Array<string> {
  return screen
    .queryAllByRole('alert')
    .map((alert) => alert.textContent.replace(/^error icon/, ''))
    .filter((text) => text !== '')
}

function field(name: string): HTMLElement {
  return screen.getByRole('textbox', { name })
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
    name: (name) => name.includes(` ${recordId} `),
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
    expect(items('Concepts')).toEqual(['Part model3 Parts', 'Flows0 Parts'])
    card('G1')
    expect(
      panel.getByRole('combobox', { name: 'Project' }).firstChild?.textContent,
    ).toBe('Glue')
    panel.getByRole('button', { name: 'Part model' })
    panel.getByRole('link', { name: 'Flows' })
    expect(panel.queryByRole('link', { current: 'page' })).toBeNull()
  })

  it('has no trail and no pinned column, and a button in the empty slot', async () => {
    await renderPage('/glue/part-model')

    expect(screen.queryByRole('navigation', { name: 'Trail' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Pinned' })).toBeNull()
    within(screen.getByRole('region', { name: 'Metrics' })).getByRole(
      'button',
      { name: 'Add Metric' },
    )
  })

  it('removes an empty Concept with its button, and shows the parent Concept', async () => {
    const { expectAddress, server } = await renderPage('/glue/flows')

    await userEvent.click(button('Remove Concept'))

    expect(server.removeConcept).toHaveBeenCalledExactlyOnceWith({
      project: 'glue',
      concept: 'flows',
    })
    await expectAddress('/glue')
  })

  it('has no button that removes a Concept with a Part', async () => {
    await renderPage('/glue/read-model')

    expect(screen.queryByRole('button', { name: 'Remove Concept' })).toBeNull()
  })

  it('switches a Concept to the map and back, and the address keeps the view', async () => {
    const { expectAddress } = await renderPage('/glue/part-model')

    await userEvent.click(screen.getByRole('tab', { name: 'Map' }))

    await expectAddress('/glue/part-model', { view: 'map' })
    expect(screen.queryByRole('region', { name: 'Decisions' })).toBeNull()
    expect(
      screen.getByRole('tab', { name: 'Map' }).getAttribute('aria-selected'),
    ).toBe('true')

    await userEvent.click(screen.getByRole('tab', { name: 'List' }))

    await expectAddress('/glue/part-model')
    screen.getByRole('region', { name: 'Decisions' })
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
    screen.getByRole('navigation', { name: 'Main' })
  })
})

describe('a section', () => {
  it('shows only its Part types, and all types again after a second click', async () => {
    const { expectAddress } = await renderPage('/glue/part-model')

    const groups = () =>
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)

    // The Contract is of the whole Concept: only the view with no lens
    // shows it.
    const all = [
      'Contract',
      'Insights',
      'Goals',
      'Decisions',
      'Guardrails',
      'Entities',
      'Flows',
      'Metrics',
    ]

    expect(groups()).toEqual(all)

    await userEvent.click(section('Understand'))

    await expectAddress('/glue/part-model', { section: 'Understand' })
    // The one Insight is Strategic: it is in a row, with no group.
    expect(groups()).toEqual(['Signals'])
    button('Add Insight')
    expect(section('Understand').getAttribute('aria-current')).toBe('page')

    await userEvent.click(section('Understand'))

    await expectAddress('/glue/part-model')
    expect(groups()).toEqual(all)
  })

  it('lists the Parts of the whole Project at the root Concept, and of the Concept in the address after a click in the left panel', async () => {
    const { expectAddress } = await renderPage(
      '/glue?section=Decide&detail=true',
    )
    const cards = () =>
      within(screen.getByRole('main'))
        .queryAllByRole('link')
        .map((link) => link.textContent)

    expect(pageTitle()).toBe('Decide')
    expect(cards()).toEqual([
      'Solid Goal G1 Agents build from the Concept Published Glue',
      `Solid Decision D4 ${D4} Published Part model`,
    ])
    expect(
      within(screen.getByRole('main')).queryByRole('group', {
        name: 'Concepts',
      }),
    ).toBeNull()

    const panel = within(screen.getByRole('navigation', { name: 'Main' }))
    await userEvent.click(panel.getByRole('button', { name: 'Part model' }))
    await userEvent.click(panel.getByRole('link', { name: 'Read model' }))

    // The click keeps the detail.
    await expectAddress('/glue/read-model', { section: 'Decide', detail: true })
    expect(items('Breadcrumb')).toEqual(['Glue', 'Part model', 'Read model'])
    expect(cards()).toEqual([])
    screen.getByRole('tab', { name: 'Summary' })

    await userEvent.click(button('Add Decision'))

    await expectAddress('/glue/read-model', {
      section: 'Decide',
      detail: true,
      add: 'decision',
    })
  })

  it('lists the Parts of the Concepts in the Concept too, and no Part of another Concept', async () => {
    const { expectAddress } = await renderPage('/glue/part-model?section=Build')
    const rows = () =>
      within(screen.getByRole('main'))
        .queryAllByRole('button', { expanded: false })
        .map((row) => row.textContent)

    expect(rows()).toEqual(['Solid Read model 1'])

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
        'link',
        { name: 'Flows' },
      ),
    )

    await expectAddress('/glue/flows', { section: 'Build' })
    expect(rows()).toEqual([])
  })

  it('shows the Concept screen after one click on the section where the member lands', async () => {
    const { expectAddress } = await renderPage('/')

    await expectAddress('/glue', { section: 'Decide' })
    expect(pageTitle()).toBe('Decide')
    expect(section('Decide').getAttribute('aria-current')).toBe('page')

    await userEvent.click(section('Decide'))

    await expectAddress('/glue')
    expect(pageTitle()).toBe('Glue')
    button('Add Concept')
    screen.getByRole('tab', { name: 'Map' })
  })

  it('shows a Strategic Part in the row of its Concept, and as a card after the switch to detail', async () => {
    const { expectAddress } = await renderPage('/glue?section=Build')
    const main = within(screen.getByRole('main'))

    expect(main.queryByRole('link')).toBeNull()
    expect(main.getByRole('button', { expanded: false }).textContent).toBe(
      'Solid Read model 1',
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Detail' }))

    await expectAddress('/glue', { section: 'Build', detail: true })
    expect(card('R1').textContent).toBe(
      `Solid Guardrail R1 ${R1} Published Read model`,
    )
    expect(main.queryByRole('button', { expanded: false })).toBeNull()
  })

  it('reads the Signals only in the section Understand', async () => {
    const { server } = await renderPage('/glue/part-model?section=Decide')

    expect(server.fetchSignals).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Signals' })).toBeNull()
  })

  it('opens the Insight that a Signal grew into', async () => {
    const { expectAddress } = await renderPage('/glue?section=Understand')

    await userEvent.click(
      screen.getByRole('link', { name: 'I3 Agents read files' }),
    )

    await expectAddress('/glue/part-model/I3', { section: 'Understand' })
  })

  it('makes an Insight from the picked Signal in the Part form, then opens its record', async () => {
    const { expectAddress, server } = await renderPage(
      '/glue/part-model?section=Understand',
    )

    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T12:00Z') })
    try {
      await userEvent.click(
        screen.getByRole('checkbox', { name: 'The list is slow' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Make Insight' }),
      )

      expect(pageTitle()).toBe('Insight')
      const title = screen.getByRole<HTMLInputElement>('textbox', {
        name: 'Title',
      })
      expect(title.value).toBe('The list is slow')

      await userEvent.clear(title)
      await userEvent.type(title, 'Long lists are slow')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    } finally {
      vi.useRealTimers()
    }

    await expectAddress('/glue/part-model/I3', { section: 'Understand' })
    expect(server.addSignalInsight).toHaveBeenCalledWith({
      project: 'glue',
      insight: {
        signals: ['https://github.com/timschoch/glue/issues/7'],
        title: 'Long lists are slow',
        body: '',
        source: 'https://github.com/timschoch/glue/issues/7',
        date: '2026-10-03',
        evidenceLevel: 'hunch',
        concept: 'part-model',
      },
    })
  })

  it('turns a group of Signals into a Hunch with one step, then opens its record', async () => {
    const again = {
      ...signals[0],
      url: 'https://support.test/agent/tickets/4',
      title: 'The list is slow to open',
      source: 'support',
    }
    const { expectAddress, server } = await renderPage(
      '/glue/part-model?section=Understand',
      {
        fetchSignals: vi.fn(() =>
          Promise.resolve({
            signals: [signals[0], again, signals[1]],
            failures: [],
            groups: [
              {
                title: signals[0].title,
                signals: [signals[0].url, again.url],
                sources: ['github', 'support'],
              },
            ],
          }),
        ),
      },
    )

    screen.getByText('2 sources')
    await userEvent.click(button('Make Hunch, The list is slow'))

    await expectAddress('/glue/part-model/I3', { section: 'Understand' })
    expect(server.addSignalInsight).toHaveBeenCalledWith({
      project: 'glue',
      insight: {
        signals: [
          'https://github.com/timschoch/glue/issues/7',
          'https://support.test/agent/tickets/4',
        ],
        concept: 'part-model',
      },
    })
  })

  it('shows at the group that its Hunch saves, then why it was not made', async () => {
    const again = {
      ...signals[0],
      url: 'https://support.test/agent/tickets/4',
      title: 'The list is slow to open',
      source: 'support',
    }
    let answer = (_: { message: string }) => {}
    const saved = new Promise<{ message: string }>((resolve) => {
      answer = resolve
    })
    await renderPage('/glue/part-model?section=Understand', {
      fetchSignals: vi.fn(() =>
        Promise.resolve({
          signals: [signals[0], again, signals[1]],
          failures: [],
          groups: [
            {
              title: signals[0].title,
              signals: [signals[0].url, again.url],
              sources: ['github', 'support'],
            },
          ],
        }),
      ),
      addSignalInsight: vi.fn(() => saved),
    })

    await userEvent.click(button('Make Hunch, The list is slow'))

    await screen.findByText('Saving')
    expect(
      screen.queryByRole('button', { name: 'Make Hunch, The list is slow' }),
    ).toBeNull()

    answer({ message: 'A Signal is not in the Project' })

    await screen.findByText('A Signal is not in the Project')
    button('Make Hunch, The list is slow')
  })

  it('goes back to the Signals when the form is cancelled', async () => {
    await renderPage('/glue?section=Understand')

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'The list is slow' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Make Insight' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    screen.getByRole('heading', { name: 'Signals' })
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
  it('opens in the main window with a click on its card, and shows no trail of one record', async () => {
    const { expectAddress } = await renderPage(
      '/glue/part-model?section=Decide',
    )

    await userEvent.click(card('D4'))

    await expectAddress('/glue/part-model/D4', { section: 'Decide' })
    expect(pageTitle()).toBe(D4)
    expect(screen.queryByRole('navigation', { name: 'Trail' })).toBeNull()
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
    expect(screen.queryByRole('navigation', { name: 'Trail' })).toBeNull()
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
    screen.getByRole('navigation', { name: 'Main' })
  })

  it('moves to the Concept that the person picks', async () => {
    const { server } = await renderPage('/glue/part-model/D4')
    const home = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Concept',
    })

    expect(home.value).toBe('part-model')
    expect(within(home).getAllByRole('option')).toHaveLength(4)

    await userEvent.selectOptions(home, 'Flows')

    await waitFor(() =>
      expect(server.updatePart).toHaveBeenCalledWith({
        project: 'glue',
        recordId: 'D4',
        change: { concept: 'flows' },
      }),
    )
  })

  it('has no control for its Concept for a person who is no member', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPeople: vi.fn(() => Promise.resolve({ ...people, me: null })),
    })

    expect(screen.queryByRole('combobox', { name: 'Concept' })).toBeNull()
  })
})

describe('a new Part', () => {
  it('opens the Part form from the button of an empty slot, and shows the record after the save', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model')

    await userEvent.click(button('Add Metric'))
    await expectAddress('/glue/part-model', { add: 'metric' })
    expect(pageTitle()).toBe('Metric')
    await userEvent.type(field('Title'), 'Time to the first Decision')
    await userEvent.click(button('Save'))

    await expectAddress('/glue/part-model/D4')
    expect(server.addPart).toHaveBeenCalledWith({
      project: 'glue',
      part: {
        type: 'metric',
        concept: 'part-model',
        title: 'Time to the first Decision',
        body: '',
      },
    })
  })

  it('lists the Parts of the Project after a # in the body, and saves the record id of the pick', async () => {
    const { server } = await renderPage('/glue/part-model?add=metric')
    await userEvent.type(field('Title'), 'Time')

    await userEvent.type(field('Body'), 'It reads #')

    // jsdom has no layout, so Carbon holds the list back as hidden, and a
    // hidden element has no name.
    expect(
      within(screen.getByLabelText('Records')).getAllByRole('option', {
        hidden: true,
      }).length,
    ).toBeGreaterThan(1)

    await userEvent.keyboard('{Enter}')
    await userEvent.click(button('Save'))

    expect(server.addPart).toHaveBeenCalledWith({
      project: 'glue',
      part: expect.objectContaining({
        body: expect.stringMatching(/^It reads #[A-Z]\d+$/),
      }),
    })
  })

  it('opens the Part form from the control of a type group', async () => {
    const { expectAddress } = await renderPage('/glue/part-model')

    await userEvent.click(button('Add Insight'))

    await expectAddress('/glue/part-model', { add: 'insight' })
    expect(pageTitle()).toBe('Insight')
  })

  it('shows a wrong value at its field and does not save', async () => {
    const { server } = await renderPage('/glue/part-model?add=insight')
    await userEvent.type(field('Title'), I3)
    await userEvent.type(field('Source'), 'Interview')
    await userEvent.clear(field('Date'))
    await userEvent.type(field('Date'), '3 May')

    await userEvent.click(button('Save'))

    expect(field('Date').getAttribute('aria-invalid')).toBe('true')
    screen.getByText(/^Enter a date, such as /)
    expect(server.addPart).not.toHaveBeenCalled()
  })

  it('shows what the server refused as one notification, and keeps the form', async () => {
    const { expectAddress } = await renderPage('/glue/part-model?add=metric', {
      addPart: vi.fn(() => Promise.resolve({ message: 'No Concept "x"' })),
    })
    await userEvent.type(field('Title'), 'Time')

    await userEvent.click(button('Save'))

    await waitFor(() => expect(alerts()).toEqual(['No Concept "x"']))
    await expectAddress('/glue/part-model', { add: 'metric' })
  })

  it('closes the form with Cancel', async () => {
    const { expectAddress } = await renderPage('/glue/part-model?add=metric')

    await userEvent.click(button('Cancel'))

    await expectAddress('/glue/part-model')
    expect(pageTitle()).toBe('Part model')
  })
})

describe('the edit of a Part', () => {
  it('opens the Part form with the values, and saves against the values that the person saw', async () => {
    const { expectAddress, server } = await renderPage('/glue/read-model/R1')

    await userEvent.click(button('Edit'))
    await expectAddress('/glue/read-model/R1', { edit: true })
    expect(pageTitle()).toBe('Guardrail R1')
    expect(field('Title')).toHaveProperty('value', R1)
    await userEvent.type(field('Enforced by'), 'verify ci')
    await userEvent.click(button('Save'))

    await expectAddress('/glue/read-model/R1')
    expect(server.updatePart).toHaveBeenCalledWith({
      project: 'glue',
      recordId: 'R1',
      change: expect.objectContaining({ title: R1, enforcedBy: 'verify ci' }),
      expected: expect.objectContaining({ title: R1, enforcedBy: null }),
    })
  })

  it('saves another title, another body and another Goal of a Decision', async () => {
    const G2 = {
      ...parts[1],
      id: 'G2',
      title: 'Agents merge faster',
    }
    const { expectAddress, server } = await renderPage(
      '/glue/part-model/D4?edit=true',
      {
        fetchParts: vi.fn(() => Promise.resolve([...parts, G2])),
        fetchPart: vi.fn(
          changedPart('D4', { owner: 'Ada', date: '2026-01-15' }),
        ),
      },
    )

    await userEvent.clear(field('Title'))
    await userEvent.type(field('Title'), 'The Concept lives in Glue')
    await userEvent.clear(field('Body'))
    await userEvent.type(field('Body'), 'Agents read it there.')
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Goal' })).getByRole('button'),
    )
    await userEvent.type(screen.getByRole('combobox', { name: 'Goal' }), 'G2')
    await userEvent.click(
      screen.getByRole('option', { name: 'G2 Agents merge faster' }),
    )
    await userEvent.click(button('Save'))

    await expectAddress('/glue/part-model/D4')
    expect(server.updatePart).toHaveBeenCalledWith({
      project: 'glue',
      recordId: 'D4',
      change: {
        title: 'The Concept lives in Glue',
        body: 'Agents read it there.',
        owner: 'Ada',
        date: '2026-01-15',
        goal: 'G2',
      },
      expected: expect.objectContaining({ title: D4 }),
    })
  })

  it('saves a wording fix of a Part', async () => {
    const { expectAddress, server } = await renderPage(
      '/glue/read-model/R1?edit=true',
    )

    await userEvent.type(field('Title'), '.')
    await userEvent.type(field('Enforced by'), 'verify ci')
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Same meaning' }),
    )
    await userEvent.click(button('Save'))

    await expectAddress('/glue/read-model/R1')
    expect(server.updatePart).toHaveBeenCalledWith({
      project: 'glue',
      recordId: 'R1',
      change: expect.objectContaining({
        title: `${R1}.`,
        sameMeaning: true,
      }),
      expected: expect.objectContaining({ title: R1 }),
    })
  })

  it('tells the person that a second person changed the Part', async () => {
    const changed = '"R1" changed since you opened it'
    await renderPage('/glue/read-model/R1?edit=true', {
      updatePart: vi.fn(() => Promise.resolve({ message: changed })),
    })
    await userEvent.type(field('Enforced by'), 'verify ci')

    await userEvent.click(button('Save'))

    await waitFor(() => expect(alerts()).toEqual([changed]))
    expect(field('Enforced by')).toHaveProperty('value', 'verify ci')
  })
})

// Clicks an action of the record. The first action is a button, each other
// action is in the menu.
async function act(label: string) {
  const main = within(screen.getByRole('main'))
  if (!main.queryByRole('button', { name: label })) {
    await userEvent.click(
      main.getByRole('button', { name: 'Additional actions' }),
    )
    // jsdom has no layout, so the open menu of Carbon stays hidden.
    const item = screen
      .getAllByRole('menuitem', { hidden: true })
      .find(({ textContent }) => textContent === label)
    if (!item) throw new Error(`No action ${label}`)
    await userEvent.click(item)
    return
  }
  await userEvent.click(main.getByRole('button', { name: label }))
}

async function chooseInDialog(title: string, label: string) {
  const dialog = within(await screen.findByRole('dialog', { name: title }))
  await userEvent.click(dialog.getByRole('button', { name: label }))
}

const answered = (recordId: string, answer: object) => ({
  project: 'glue',
  recordId,
  answer,
})

describe('the section Mine', () => {
  const mine: PartSummary[] = [
    { ...parts[2], trust: 'flagged', workState: 'to-check' },
    { ...parts[0], trust: 'not-ready', workState: 'draft' },
  ]

  it('lists the Parts of the Project that need the owner, with their count beside it', async () => {
    const { expectAddress } = await renderPage('/glue/read-model', {
      fetchMine: vi.fn(() => Promise.resolve(mine)),
    })

    await userEvent.click(section('Mine 2'))

    await expectAddress('/glue/read-model', { section: 'Mine' })
    expect(pageTitle()).toBe('Mine')
    expect(within(screen.getByRole('main')).getAllByRole('link')).toHaveLength(
      2,
    )
    expect(card('D4').textContent).toContain('To check')
    expect(card('I3').textContent).toContain('Draft')

    await userEvent.click(card('D4'))

    await expectAddress('/glue/part-model/D4', { section: 'Mine' })
    expect(pageTitle()).toBe(D4)
  })

  it('shows the watched Parts in a group of their own, a flag as a note', async () => {
    await renderPage('/glue?section=Mine', {
      fetchMine: vi.fn(() => Promise.resolve(mine)),
      fetchWatched: vi.fn(() =>
        Promise.resolve([
          {
            ...parts[3],
            trust: 'flagged' as const,
            workState: 'to-check' as const,
            flags: [
              {
                cause: { id: 'D4', title: D4 },
                reason: 'changed' as const,
                createdAt: '2026-10-03T08:00:00.000Z',
              },
              {
                cause: { id: 'I3', title: I3 },
                reason: 'wrong' as const,
                createdAt: '2026-10-03T09:00:00.000Z',
              },
            ],
          },
        ]),
      ),
    })

    const watched = within(screen.getByRole('list', { name: 'Watched' }))

    expect(section('Mine 2')).toBeDefined()
    expect(
      watched.getAllByRole('link').map((link) => link.textContent),
    ).toEqual([
      `Flagged Guardrail R1 ${R1} Changed: D4 ${D4}\nWrong: I3 ${I3} To check Read model`,
    ])
  })

  it('shows no count and no card to a member who owns nothing, and plain words in their place', async () => {
    await renderPage('/glue?section=Mine')
    const main = within(screen.getByRole('main'))

    expect(pageTitle()).toBe('Mine')
    expect(section('Mine').getAttribute('aria-current')).toBe('page')
    expect(main.queryByRole('link')).toBeNull()
    expect(main.getByText('No Parts')).toBeTruthy()
  })
})

describe('the section Use', () => {
  // A funnel that misses its target.
  const reading: PartMeasure = {
    measure: {
      kind: 'funnel',
      source: 'mock-analytics',
      steps: ['signed-up', 'paid'],
      target: 0.25,
      window_days: 7,
    },
    baseline: null,
    latestValue: 0.1,
    latestBreakdownValue: null,
    measuredAt: '2026-10-04T00:00:00.000Z',
    target: 0.25,
    onTarget: false,
  }
  const metric = { ...parts[0], type: 'metric' } as const
  const measured: MeasuredPart[] = [
    { ...parts[1], measure: { ...reading, latestValue: 0.3, onTarget: true } },
    { ...metric, id: 'M1', title: 'Signup to paid', measure: reading },
    { ...metric, id: 'M2', title: 'Ease of the first build', measure: null },
  ]

  it('lists each Metric and each measured Goal with its newest value against its target', async () => {
    const { expectAddress } = await renderPage(
      '/glue?section=Use&detail=true',
      { fetchMeasured: vi.fn(() => Promise.resolve(measured)) },
    )

    expect(pageTitle()).toBe('Use')
    expect(card('G1').textContent).toContain('30% Target 25%')
    expect(within(card('G1')).getByLabelText('On target')).toBeDefined()
    expect(card('M1').textContent).toContain('10% Target 25%')
    expect(within(card('M1')).getByLabelText('Off target')).toBeDefined()

    await userEvent.click(card('M1'))

    await expectAddress('/glue/part-model/M1', { section: 'Use' })
  })

  it('shows an empty slot for a Metric with no reading', async () => {
    await renderPage('/glue?section=Use&detail=true', {
      fetchMeasured: vi.fn(() => Promise.resolve(measured)),
    })

    expect(card('M2').textContent).toContain('Reading')
    expect(within(card('M2')).queryByLabelText(/target/)).toBeNull()
  })

  it('adds a Metric in a Project with no Metric', async () => {
    const { expectAddress } = await renderPage('/glue?section=Use')

    expect(pageTitle()).toBe('Use')

    await userEvent.click(button('Add Metric'))

    await expectAddress('/glue', { section: 'Use', add: 'metric' })
  })

  it('shows the reading of the Goal that a Decision serves on its record', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPart: vi.fn(changedPart('D4', { measured: [measured[0]] })),
    })

    expect(card('G1').textContent).toContain('30% Target 25%')
    expect(within(card('G1')).getByLabelText('On target')).toBeDefined()
  })

  it('names the flag of a reading that misses its target', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPart: vi.fn(
        changedPart('D4', {
          trust: 'flagged',
          flags: [
            {
              cause: { id: 'G1', title: parts[1].title },
              reason: 'off-target',
              createdAt: '2026-10-04T00:00:00.000Z',
            },
          ],
        }),
      ),
    })

    const flags = within(screen.getByRole('list', { name: 'Flags' }))

    expect(flags.getByText('Off target')).toBeDefined()
  })
})

describe('a flagged record', () => {
  const flagged = {
    fetchPart: vi.fn(
      changedPart('D4', {
        trust: 'flagged',
        workState: 'to-check',
        answers: ['fine', 'wait', 'need-time', 'not-ready', 'sink'],
        flags: [
          {
            cause: { id: 'I3', title: I3 },
            reason: 'changed',
            createdAt: '2026-10-03T08:00:00.000Z',
          },
        ],
      }),
    ),
  }

  it('lists the flag as its reason and the card of its cause, and opens the cause', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/D4', flagged)

    const flags = within(screen.getByRole('list', { name: 'Flags' }))

    flags.getByText('Changed')

    await userEvent.click(flags.getByRole('link', { name: / I3 / }))

    await expectAddress('/glue/part-model/I3', { trail: ['D4'] })
  })

  it('answers that it is fine with the one button', async () => {
    const { server } = await renderPage('/glue/part-model/D4', flagged)

    await act('It is fine')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('D4', { answer: 'fine' }),
      ),
    )
  })

  it('waits for the Part that the person picks', async () => {
    const { server } = await renderPage('/glue/part-model/D4', flagged)

    await act('Wait')
    expect(server.answerPart).not.toHaveBeenCalled()
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Wait for' }),
      'r1',
    )
    await userEvent.click(await screen.findByRole('option', { name: /R1/ }))

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('D4', { answer: 'wait', waitsOn: 'R1' }),
      ),
    )
  })
})

describe('a Part with an empty slot that needs a Part under review', () => {
  const unsure: Pick<Part, 'trust' | 'emptySlots' | 'reviewNotes'> = {
    trust: 'flagged',
    emptySlots: ['evidence'],
    reviewNotes: [
      { id: 'G1', type: 'goal', title: 'Agents build from the Concept' },
    ],
  }
  const server = {
    fetchPart: vi.fn(changedPart('D4', unsure)),
    fetchParts: vi.fn(() =>
      Promise.resolve(
        parts.map((part) => (part.id === 'D4' ? { ...part, ...unsure } : part)),
      ),
    ),
  }

  it('shows the reason and the Part under review on the record, and opens that Part', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/D4', server)

    within(screen.getByRole('list', { name: 'Flags' })).getByText(
      'Needs evidence',
    )

    await userEvent.click(
      within(screen.getByRole('region', { name: 'Review' })).getByRole('link', {
        name: / G1 /,
      }),
    )

    await expectAddress('/glue/glue/G1', { trail: ['D4'] })
  })

  it('shows the empty slot and the Part under review on the card', async () => {
    await renderPage('/glue?section=Decide&detail=true', server)

    expect(card('D4').textContent).toContain(
      'Review: Goal G1 Agents build from the Concept',
    )
    within(card('D4')).getByText('Evidence')
  })
})

describe('a record with a flag of a new Contract Version', () => {
  const flagged = {
    fetchPart: vi.fn(
      changedPart('D4', {
        trust: 'flagged',
        workState: 'to-check',
        flags: [
          {
            cause: { id: 'I3', title: I3 },
            reason: 'new-version',
            createdAt: '2026-10-03T08:00:00.000Z',
            contract: {
              concept: 'part-model',
              builtWith: 1,
              newest: 2,
              changes: [
                { field: 'title', before: 'Agents read docs', after: I3 },
              ],
            },
          },
        ],
      }),
    ),
  }

  it('moves the Joint to the new Version with the button of the flag', async () => {
    const { server } = await renderPage('/glue/part-model/D4', flagged)

    await userEvent.click(
      screen.getByRole('button', { name: 'Move to Version 2' }),
    )

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('D4', { answer: 'move-to-version', needs: 'I3', version: 2 }),
      ),
    )
  })
})

describe('the question of a Decision', () => {
  const asked = {
    fetchPart: vi.fn(
      changedPart('D4', {
        status: 'proposed',
        trust: 'not-ready',
        workState: 'review',
        answers: ['supersede', 'not-ready', 'sink'],
        question: {
          options: ['Cache it', 'Render on the edge', 'Do nothing'],
          pick: 2,
          answer: null,
        },
      }),
    ),
  }

  it('answers with the pick of the author with the one button', async () => {
    const { server } = await renderPage('/glue/part-model/D4', asked)

    await act('Answer')

    await waitFor(() =>
      expect(server.answerQuestion).toHaveBeenCalledWith(
        answered('D4', { option: 2 }),
      ),
    )
    expect(server.answerPart).not.toHaveBeenCalled()
  })

  it('answers with the option that the person picks', async () => {
    const { server } = await renderPage('/glue/part-model/D4', asked)

    await userEvent.click(screen.getByRole('radio', { name: 'Do nothing' }))
    await act('Answer')

    await waitFor(() =>
      expect(server.answerQuestion).toHaveBeenCalledWith(
        answered('D4', { option: 3 }),
      ),
    )
  })

  it('answers with the words of the person in place of an option', async () => {
    const { server } = await renderPage('/glue/part-model/D4', asked)

    await userEvent.type(field('Answer'), 'Buy a CDN')
    await act('Answer')

    await waitFor(() =>
      expect(server.answerQuestion).toHaveBeenCalledWith(
        answered('D4', { text: 'Buy a CDN' }),
      ),
    )
  })

  it('keeps the other answers of the Decision in the menu', async () => {
    const { server } = await renderPage('/glue/part-model/D4', asked)

    await act('Not ready')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('D4', { answer: 'not-ready' }),
      ),
    )
  })
})

describe('the answers of a Decision', () => {
  const review = {
    fetchPart: vi.fn(
      changedPart('D4', {
        status: 'proposed',
        trust: 'not-ready',
        workState: 'review',
        answers: ['supersede', 'not-ready', 'sink'],
      }),
    ),
  }
  const sink = answered('D4', { answer: 'sink' })

  it('signs off a Decision in review with the one button', async () => {
    const { server } = await renderPage('/glue/part-model/D4', review)

    await act('Sign off')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('D4', { answer: 'supersede' }),
      ),
    )
  })

  it('gives the answer in words with the sign-off', async () => {
    const { server } = await renderPage('/glue/part-model/D4', review)

    await userEvent.type(field('Answer'), 'Yes, go')
    await act('Sign off')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('D4', { answer: 'supersede', words: 'Yes, go' }),
      ),
    )
  })

  it('takes no answer in words on a Decision that is not in review', async () => {
    await renderPage('/glue/part-model/D4')

    expect(screen.queryByRole('textbox', { name: 'Answer' })).toBeNull()
  })

  it('sinks a Decision after the person confirms, and the record stays', async () => {
    const { expectAddress, server } = await renderPage(
      '/glue/part-model/D4',
      review,
    )

    await act('Sink it')
    expect(server.answerPart).not.toHaveBeenCalled()
    await chooseInDialog('Sink Decision D4', 'Sink it')

    await waitFor(() => expect(server.answerPart).toHaveBeenCalledWith(sink))
    await expectAddress('/glue/part-model/D4')
    expect(pageTitle()).toBe(D4)
  })

  it('tells the person why the Decision did not sink', async () => {
    const changed = '"D4" changed at the same time: read it and answer again'
    await renderPage('/glue/part-model/D4', {
      ...review,
      answerPart: vi.fn(() => Promise.resolve({ message: changed })),
    })

    await act('Sink it')
    await chooseInDialog('Sink Decision D4', 'Sink it')

    await waitFor(() => expect(alerts()).toEqual([changed]))
  })

  it('shows the Trust and the Work state of a sunk Decision', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPart: vi.fn(
        changedPart('D4', {
          status: 'superseded',
          trust: 'wrong',
          workState: 'sunk',
          answers: [],
        }),
      ),
    })

    const main = within(screen.getByRole('main'))

    main.getByText('Wrong')
    main.getByText('Sunk')
    expect(main.queryByRole('region', { name: 'Next' })).toBeNull()
  })

  it('opens the Part form for the Decision that supersedes', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model/D4')

    await act('Supersede')
    await expectAddress('/glue/part-model/D4', { add: 'decision' })
    expect(pageTitle()).toBe('Decision')
    await userEvent.type(field('Title'), 'The Concept lives in files')
    await userEvent.click(button('Save'))

    await waitFor(() =>
      expect(server.addPart).toHaveBeenCalledWith({
        project: 'glue',
        part: expect.objectContaining({
          type: 'decision',
          concept: 'part-model',
          status: 'accepted',
          supersedes: 'D4',
          owner: 'Ada',
          needs: ['G1', 'I3'],
        }),
      }),
    )
  })

  it('does not offer to supersede a superseded Decision', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPart: vi.fn(changedPart('D4', { status: 'superseded' })),
    })

    const main = within(screen.getByRole('main'))

    expect(main.queryByRole('button', { name: 'Supersede' })).toBeNull()
    main.getByRole('button', { name: 'Add Flow' })
  })
})

describe('the common flow of a record', () => {
  // The step bar of the flow, and the label of its current step.
  function currentStep(flow: string): string | undefined {
    const bar = within(screen.getByRole('list', { name: flow }))
    return bar
      .getAllByRole('button')
      .find((step) => step.getAttribute('aria-current') === 'step')?.title
  }

  it('shows the step bar above the box Next, with the next step as the one button', async () => {
    await renderPage('/glue/part-model/D4')

    const next = screen.getByRole('region', { name: 'Next' })

    expect(currentStep('Decision to Brief')).toBe('Fill slots')
    expect(next.previousElementSibling).toBe(
      screen.getByRole('list', { name: 'Decision to Brief' }),
    )
    within(next).getByRole('button', { name: 'Add Flow' })
  })

  it('adds the Flow that needs the Decision', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model/D4')

    await act('Add Flow')
    await expectAddress('/glue/part-model/D4', { add: 'flow' })
    expect(pageTitle()).toBe('Flow')
    await userEvent.type(field('Title'), 'Read a Concept')
    await userEvent.click(button('Save'))

    await waitFor(() =>
      expect(server.addPart).toHaveBeenCalledWith({
        project: 'glue',
        part: {
          type: 'flow',
          concept: 'part-model',
          title: 'Read a Concept',
          body: '',
          needs: ['D4'],
        },
      }),
    )
  })

  it('opens the form of the Decision that serves the Goal, with the Goal as its pick', async () => {
    const { expectAddress } = await renderPage('/glue/glue/G1', {
      fetchPart: vi.fn(changedPart('G1', { neededBy: [] })),
    })

    expect(currentStep('Insight to Decision')).toBe('Choose')

    await act('Add Decision')

    await expectAddress('/glue/glue/G1', { add: 'decision' })
    expect(pageTitle()).toBe('Decision')
    within(screen.getByRole('main')).getByText('Agents build from the Concept')
  })

  it('adds the Decision that has the Insight as its evidence', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model/I3', {
      fetchPart: vi.fn(
        changedPart('I3', { evidenceLevel: 'confirmed', neededBy: [] }),
      ),
    })

    await act('Add Decision')
    await expectAddress('/glue/part-model/I3', { add: 'decision' })
    within(screen.getByRole('list', { name: 'Evidence' })).getByText(I3)
    await userEvent.type(field('Title'), 'Agents read the Concept')
    await userEvent.type(screen.getByRole('combobox', { name: 'Goal' }), 'g1')
    await userEvent.click(await screen.findByRole('option', { name: /G1/ }))
    await userEvent.click(button('Save'))

    await waitFor(() =>
      expect(server.addPart).toHaveBeenCalledWith({
        project: 'glue',
        part: expect.objectContaining({
          type: 'decision',
          status: 'proposed',
          needs: ['G1', 'I3'],
        }),
      }),
    )
  })

  it('adds the Decision that needs the Part of another type as a Joint', async () => {
    const { server } = await renderPage('/glue/part-model/D4?add=decision', {
      fetchPart: vi.fn(changedPart('D4', { status: 'superseded' })),
    })

    expect(screen.queryByRole('list', { name: 'Evidence' })).toBeNull()
    await userEvent.type(field('Title'), 'Agents read the Concept')
    await userEvent.type(screen.getByRole('combobox', { name: 'Goal' }), 'g1')
    await userEvent.click(await screen.findByRole('option', { name: /G1/ }))
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Evidence' }),
      'i3',
    )
    await userEvent.click(await screen.findByRole('option', { name: /I3/ }))
    await userEvent.click(button('Save'))

    await waitFor(() =>
      expect(server.addPart).toHaveBeenCalledWith({
        project: 'glue',
        part: expect.objectContaining({
          type: 'decision',
          status: 'proposed',
          needs: ['G1', 'I3', 'D4'],
        }),
      }),
    )
  })

  it('opens the form of an Insight to raise its level', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/I3')

    expect(currentStep('Evidence to Insight')).toBe('Check')

    await act('Raise the level')

    await expectAddress('/glue/part-model/I3', { edit: true })
  })

  it('proposes Pattern for a Hunch whose Signals come from two sources, and raises it', async () => {
    const grown = [
      { url: signals[1].url, title: signals[1].title, source: 'github' },
      {
        url: 'https://support.test/agent/tickets/4',
        title: 'The agent reads all files',
        source: 'support',
      },
    ]
    const { server } = await renderPage('/glue/part-model/I3', {
      fetchPart: vi.fn(
        changedPart('I3', {
          evidenceLevel: 'hunch',
          signals: grown.map(({ url, title }) => ({ url, title })),
        }),
      ),
      fetchSignals: vi.fn(() =>
        Promise.resolve({
          signals: grown.map((signal) => ({
            ...signal,
            text: '',
            date: '2026-10-01',
            insight: { id: 'I3', title: I3 },
          })),
          failures: [],
          groups: [],
        }),
      ),
    })

    await act('Raise to Pattern')

    await waitFor(() =>
      expect(server.updatePart).toHaveBeenCalledWith({
        project: 'glue',
        recordId: 'I3',
        change: { evidenceLevel: 'pattern' },
      }),
    )
  })

  it('reads no Signals for a Hunch that grew from one Signal', async () => {
    const { server } = await renderPage('/glue/part-model/I3', {
      fetchPart: vi.fn(
        changedPart('I3', {
          evidenceLevel: 'hunch',
          signals: [{ url: signals[1].url, title: signals[1].title }],
        }),
      ),
    })

    button('Raise the level')
    expect(server.fetchSignals).not.toHaveBeenCalled()
  })

  it('opens the Concept of a published Guardrail for its sign-off', async () => {
    const { expectAddress } = await renderPage('/glue/read-model/R1')

    expect(currentStep('Decision to Brief')).toBe('Sign')

    await act('Open Concept')

    await expectAddress('/glue/read-model')
  })

  it('keeps the other answers in the menu of the button', async () => {
    const { server } = await renderPage('/glue/read-model/R1')

    await act('Not ready')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('R1', { answer: 'not-ready' }),
      ),
    )
  })

  it('lists what happened to the record, with a link to the cause of a flag', async () => {
    const { expectAddress } = await renderPage('/glue/part-model/D4', {
      fetchPart: vi.fn(
        changedPart('D4', {
          activity: [
            {
              kind: 'flag-closed',
              at: '2026-10-03T09:00:00.000Z',
              cause: { id: 'I3', title: I3 },
              reason: 'changed',
            },
            { kind: 'published', at: '2026-10-02T08:00:00.000Z' },
          ],
        }),
      ),
    })

    const activity = within(screen.getByRole('region', { name: 'Activity' }))

    expect(
      activity.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['2026-10-03Flag closedChangedI3', '2026-10-02Published'])

    await userEvent.click(activity.getByRole('link', { name: 'I3' }))

    await expectAddress('/glue/part-model/I3', { trail: ['D4'] })
  })

  it('lists the steps of the record with the member of each one', async () => {
    await renderPage('/glue/part-model/D4')

    const activity = within(screen.getByRole('region', { name: 'Activity' }))

    expect(
      activity.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual([
      '2026-10-05PublishedAdaVersion 2',
      '2026-10-04ReviewTim',
      '2026-10-04EditedTim',
      '2026-10-03DraftTim',
      '2026-10-02PublishedAdaVersion 1',
      '2026-10-01DraftTim',
    ])
  })

  it('opens an old Version of the record in the activity list', async () => {
    await renderPage('/glue/part-model/D4')

    await userEvent.click(button('Version 1'))

    const version = within(screen.getByRole('region', { name: 'Version 1' }))
    expect(version.getByRole('heading', { name: OLD_TITLE })).toBeTruthy()
    expect(pageTitle()).toBe(D4)
  })
})

describe('the answers of an Insight in draft', () => {
  const draft = {
    fetchPart: vi.fn(
      changedPart('I3', {
        status: 'draft',
        trust: 'not-ready',
        workState: 'draft',
        answers: ['supersede', 'ready', 'not-ready', 'sink'],
      }),
    ),
  }

  it('says that the Insight is ready for review', async () => {
    const { server } = await renderPage('/glue/part-model/I3', draft)

    await act('Ready for review')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('I3', { answer: 'ready' }),
      ),
    )
  })

  it('signs off the Insight', async () => {
    const { server } = await renderPage('/glue/part-model/I3', draft)

    await act('Sign off')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('I3', { answer: 'supersede' }),
      ),
    )
  })

  it('sinks the Insight after the person confirms, and the record stays', async () => {
    const { expectAddress, server } = await renderPage(
      '/glue/part-model/I3',
      draft,
    )

    await act('Sink it')
    await chooseInDialog('Sink Insight I3', 'Sink it')

    await waitFor(() =>
      expect(server.answerPart).toHaveBeenCalledWith(
        answered('I3', { answer: 'sink' }),
      ),
    )
    await expectAddress('/glue/part-model/I3')
    expect(pageTitle()).toBe(I3)
  })
})

describe('the Joints of a record', () => {
  it('adds a Joint to a Part that the search finds by its record id', async () => {
    const { server } = await renderPage('/glue/read-model/R1')
    const needs = within(screen.getByRole('region', { name: 'Needs' }))

    await userEvent.type(
      needs.getByRole('combobox', { name: 'Add Joint' }),
      'g1',
    )
    await userEvent.click(await screen.findByRole('option', { name: /G1/ }))

    await waitFor(() =>
      expect(server.addJoint).toHaveBeenCalledWith({
        project: 'glue',
        joint: { part: 'R1', needs: 'G1' },
      }),
    )
  })

  it('removes a Joint', async () => {
    const { server } = await renderPage('/glue/part-model/D4')

    await userEvent.click(button('Remove I3'))

    await waitFor(() =>
      expect(server.removeJoint).toHaveBeenCalledWith({
        project: 'glue',
        jointId: 2,
      }),
    )
  })
})

describe('the people of a Project', () => {
  it('shows each member with the loop steps and with what the member holds', async () => {
    await renderPage('/glue?section=People')

    const ada = within(screen.getByRole('region', { name: 'Ada' }))
    const bo = within(screen.getByRole('region', { name: 'Bo' }))

    expect(pageTitle()).toBe('People')
    expect(
      within(ada.getByRole('list', { name: 'Responsible' }))
        .getByRole('link')
        .getAttribute('href'),
    ).toBe('/glue/part-model/D4?section=People')
    expect(bo.getByText('Build, Use')).toBeDefined()
    expect(
      within(bo.getByRole('list', { name: 'Co-Author' }))
        .getByRole('link', { name: 'Part model' })
        .getAttribute('href'),
    ).toBe('/glue/part-model')
  })

  it('sets the loop steps of the person who reads', async () => {
    const { server } = await renderPage('/glue?section=People')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Build' }))

    await waitFor(() =>
      expect(server.setLoopSteps).toHaveBeenCalledWith({
        project: 'glue',
        loopSteps: ['decide', 'build'],
      }),
    )
  })

  it('adds a member by the e-mail address, and says why it did not work', async () => {
    const { server } = await renderPage('/glue?section=People', {
      addMember: vi.fn(() =>
        Promise.resolve({
          message: 'No account has the e-mail address cy@example.com.',
        }),
      ),
    })

    await userEvent.type(field('E-mail'), 'cy@example.com')
    await userEvent.click(button('Add member'))

    await waitFor(() =>
      expect(alerts()).toEqual([
        'No account has the e-mail address cy@example.com.',
      ]),
    )
    expect(server.addMember).toHaveBeenCalledWith({
      project: 'glue',
      email: 'cy@example.com',
    })
  })

  it('shows what a member watches', async () => {
    await renderPage('/glue?section=People')

    const bo = within(screen.getByRole('region', { name: 'Bo' }))

    expect(
      within(bo.getByRole('list', { name: 'Watcher' }))
        .getByRole('link')
        .getAttribute('href'),
    ).toBe('/glue/part-model/D4?section=People')
  })

  // Bo owns D4 and Ada reads.
  const ownedByBo = {
    ...people,
    assignments: [
      {
        id: 1,
        memberId: 2,
        role: 'responsible' as const,
        concept: null,
        part: 'D4',
      },
    ],
    watchers: [],
  }

  it('watches a record of another owner', async () => {
    const { server } = await renderPage('/glue/part-model/D4', {
      fetchPeople: vi.fn(() => Promise.resolve(ownedByBo)),
    })

    expect(button('Watch 0').getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(button('Watch 0'))

    await waitFor(() =>
      expect(server.watch).toHaveBeenCalledWith({
        project: 'glue',
        recordId: 'D4',
      }),
    )
    expect(server.unwatch).not.toHaveBeenCalled()
  })

  it('stops watching a record that the person watches', async () => {
    const { server } = await renderPage('/glue/part-model/D4', {
      fetchPeople: vi.fn(() =>
        Promise.resolve({
          ...ownedByBo,
          watchers: [{ memberId: 1, part: 'D4' }],
        }),
      ),
    })

    expect(button('Watch 1').getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(button('Watch 1'))

    await waitFor(() =>
      expect(server.unwatch).toHaveBeenCalledWith({
        project: 'glue',
        recordId: 'D4',
      }),
    )
  })

  it('gives the owner of a record no Watch control', async () => {
    await renderPage('/glue/part-model/D4')

    expect(screen.queryByRole('button', { name: /^Watch/ })).toBeNull()
  })

  it('gives a member who is not the owner of a flagged record the owner to ask, and no answer', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPeople: vi.fn(() => Promise.resolve(ownedByBo)),
      fetchPart: vi.fn(
        changedPart('D4', {
          answers: [],
          answeredBy: { name: 'Bo', email: 'bo@example.com' },
        }),
      ),
    })

    expect(
      screen.getByRole('link', { name: 'Ask Bo' }).getAttribute('href'),
    ).toBe(
      'mailto:bo@example.com?subject=D4%20The%20Concept%20lives%20in%20the%20database',
    )
    expect(screen.queryByRole('button', { name: 'Not ready' })).toBeNull()
  })

  it('gives a record another Responsible', async () => {
    const { server } = await renderPage('/glue/part-model/D4')
    const responsible = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Responsible',
    })

    expect(responsible.value).toBe('1')

    await userEvent.selectOptions(responsible, 'Bo')

    await waitFor(() =>
      expect(server.assign).toHaveBeenCalledWith({
        project: 'glue',
        assignment: {
          member: 'bo@example.com',
          part: 'D4',
          role: 'responsible',
        },
      }),
    )
  })

  it('takes a Co-Author away from a Concept', async () => {
    const { server } = await renderPage('/glue/part-model')
    const bo = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Bo' })

    expect(bo.checked).toBe(true)

    await userEvent.click(bo)

    await waitFor(() =>
      expect(server.unassign).toHaveBeenCalledWith({
        project: 'glue',
        assignment: { member: 'bo@example.com', concept: 'part-model' },
      }),
    )
  })

  it('shows the people to a person who is no member, with no control', async () => {
    await renderPage('/glue/part-model/D4', {
      fetchPeople: vi.fn(() => Promise.resolve({ ...people, me: null })),
    })

    expect(screen.getByText('Responsible').nextSibling?.textContent).toBe('Ada')
    expect(screen.queryByRole('combobox', { name: 'Responsible' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Watch/ })).toBeNull()
  })
})

describe('a new Concept and a new Project', () => {
  it('adds a Concept below the Concept of the view, and opens it', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model')

    await userEvent.click(button('Add Concept'))
    await expectAddress('/glue/part-model', { add: 'concept' })
    await userEvent.type(field('Title'), 'Write model')
    await userEvent.click(button('Save'))

    await expectAddress('/glue/write-model')
    expect(server.addConcept).toHaveBeenCalledWith({
      project: 'glue',
      concept: {
        slug: 'write-model',
        title: 'Write model',
        parent: 'part-model',
      },
    })
  })

  it('adds a second Concept at the top level from the start of the Project', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model')

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'Glue' },
      ),
    )
    await expectAddress('/glue')
    await userEvent.click(button('Add Concept'))
    await userEvent.type(field('Title'), 'Write model')
    await userEvent.click(button('Save'))

    await expectAddress('/glue/write-model')
    expect(server.addConcept).toHaveBeenCalledWith({
      project: 'glue',
      concept: { slug: 'write-model', title: 'Write model', parent: 'glue' },
    })
  })

  it.each(['/glue/part-model', '/glue/part-model/D4', '/glue?section=Mine'])(
    'adds a Concept at the top level from the left panel at %s, and opens it',
    async (path) => {
      const { expectAddress, server } = await renderPage(path)

      await userEvent.click(
        within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
          'button',
          { name: 'Add Concept' },
        ),
      )
      await expectAddress('/glue', { add: 'concept' })
      await userEvent.type(field('Title'), 'Write model')
      await userEvent.click(button('Save'))

      await expectAddress('/glue/write-model')
      expect(server.addConcept).toHaveBeenCalledWith({
        project: 'glue',
        concept: { slug: 'write-model', title: 'Write model', parent: 'glue' },
      })
    },
  )

  it('adds a Project from the Project switcher, and opens it', async () => {
    const { expectAddress, server } = await renderPage('/glue/part-model')

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
        'button',
        { name: 'Add Project' },
      ),
    )
    await expectAddress('/glue', { add: 'project' })
    expect(field('Name').getAttribute('placeholder')).toBeNull()
    await userEvent.type(field('Name'), 'My Project')
    await userEvent.click(button('Save'))

    await expectAddress('/my-project')
    expect(server.addProject).toHaveBeenCalledWith({
      slug: 'my-project',
      name: 'My Project',
    })
  })

  it.each([
    ['Project', '/glue?add=project', 'Name', 'Enter a name with a letter.'],
    [
      'Concept',
      '/glue/part-model?add=concept',
      'Title',
      'Enter a title with a letter.',
    ],
  ])(
    'shows the name of a %s without a letter as wrong at its field, and does not save',
    async (_added, path, label, reason) => {
      const { server } = await renderPage(path)
      expect(field(label).getAttribute('placeholder')).toBeNull()
      await userEvent.type(field(label), '!?')

      await userEvent.click(button('Save'))

      screen.getByText(reason)
      expect(server.addProject).not.toHaveBeenCalled()
      expect(server.addConcept).not.toHaveBeenCalled()
    },
  )
})

describe('the session', () => {
  it('signs the person out from the frame, and shows sign-in', async () => {
    const { expectAddress, server } = await renderPage('/glue')
    vi.mocked(server.fetchSession).mockResolvedValue(undefined)

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole(
        'button',
        { name: 'Sign out' },
      ),
    )

    await expectAddress('/sign-in')
    expect(server.signOut).toHaveBeenCalledOnce()
    expect(pageTitle()).toBe('Sign in to Glue')
  })

  it('signs a person in with the email and the password', async () => {
    const { server } = await renderPage('/sign-in', signedOut())

    await userEvent.type(field('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(server.signIn).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'correct horse',
      }),
    )
  })

  it('shows a wrong email at its field and does not sign in', async () => {
    const { server } = await renderPage('/sign-in', signedOut())
    await userEvent.type(field('Email'), 'ada')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(field('Email').getAttribute('aria-invalid')).toBe('true')
    expect(server.signIn).not.toHaveBeenCalled()
  })

  it('shows what the server refused as one notification', async () => {
    const refused = 'The email or the password is wrong.'
    await renderPage('/sign-in', {
      ...signedOut(),
      signIn: vi.fn(() => Promise.resolve({ message: refused })),
    })
    await userEvent.type(field('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(alerts()).toEqual([refused]))
  })

  it('makes an account with the name, the email and the password', async () => {
    const { server } = await renderPage('/sign-up', signedOut())

    await userEvent.type(field('Name'), 'Ada')
    await userEvent.type(field('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Make account' }))

    await waitFor(() =>
      expect(server.signUp).toHaveBeenCalledWith({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'correct horse',
      }),
    )
  })
})

describe('the Map', () => {
  // React Flow and ELK load with the Map, and ELK places the nodes.
  const loaded = { timeout: 20_000 }

  async function findMap() {
    return within(await screen.findByRole('figure', { name: 'Map' }, loaded))
  }

  it('shows the top-level Concepts of a Project closed, opens one in place, and the address keeps it', async () => {
    const { expectAddress, server } = await renderPage('/glue?view=map')
    const map = await findMap()

    await map.findByRole('link', { name: /^Flows/ }, loaded)
    await userEvent.click(map.getByRole('button', { name: /^Part model/ }))

    await expectAddress('/glue', { view: 'map', expanded: ['part-model'] })
    await map.findByRole('link', { name: /^Read model/ }, loaded)
    expect(server.fetchMapJoints).toHaveBeenCalledWith('glue')
  })

  it('reads no Joints of the Map for the list', async () => {
    const { server } = await renderPage('/glue')

    expect(server.fetchMapJoints).not.toHaveBeenCalled()
  })

  it('opens a Part of the Map in the panel beside the Map, and Escape closes it', async () => {
    const { expectAddress } = await renderPage('/glue/read-model?view=map')
    const map = await findMap()

    await userEvent.click(
      await map.findByRole('link', { name: / R1 / }, loaded),
    )

    await expectAddress('/glue/read-model', { view: 'map', panel: 'R1' })
    const panel = within(
      await screen.findByRole('complementary', { name: 'Guardrail R1' }),
    )
    panel.getByRole('heading', { name: R1 })
    expect(panel.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      '/glue/read-model/R1',
    )
    map.getByRole('link', { name: / R1 / })

    await userEvent.keyboard('{Escape}')

    await expectAddress('/glue/read-model', { view: 'map' })
    expect(screen.queryByRole('complementary', { name: 'Guardrail R1' })).toBe(
      null,
    )
  })

  it('opens a sub Concept of the Map in the panel, and the close button closes it', async () => {
    const { expectAddress } = await renderPage('/glue/part-model?view=map')
    const map = await findMap()

    await userEvent.click(
      await map.findByRole('link', { name: /^Read model/ }, loaded),
    )

    await expectAddress('/glue/part-model', {
      view: 'map',
      panel: 'read-model',
    })
    const panel = within(
      await screen.findByRole('complementary', { name: 'Read model' }),
    )
    expect(panel.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      '/glue/read-model?view=map',
    )

    await userEvent.click(panel.getByRole('button', { name: 'Close' }))

    await expectAddress('/glue/part-model', { view: 'map' })
  })
})

describe('an Ask to another Project', () => {
  const flexibeck = { slug: 'flexibeck', name: 'flexibeck' }
  // The published Insight of flexibeck that Bo hands back.
  const study: LeveledPart = {
    ...parts[0],
    id: 'I1',
    title: 'Agents skip long files',
    concept: 'flexibeck',
    conceptTitle: 'flexibeck',
  }
  const bo = { user: { id: 'user-2', name: 'Bo', email: 'bo@example.com' } }

  // The Asks of Mine: the group, the text of each card and its one step.
  function mineAsks() {
    const group = screen.queryByRole('list', { name: 'Asks' })
    if (!group) return []
    return within(group)
      .getAllByRole('listitem')
      .map((item) => [
        within(item).getByRole('link').textContent,
        within(item).getByRole('button').textContent,
      ])
  }

  it('goes from the Hunch of Ada to Mine of Bo, and back to Mine of Ada', async () => {
    // The one Ask, as a server that saves each step: Glue asks flexibeck.
    let ask: Ask | null = null
    const asking: Partial<Server> = {
      fetchParts: vi.fn((project) =>
        Promise.resolve(project === 'glue' ? parts : [study]),
      ),
      fetchAskState: vi.fn(() =>
        Promise.resolve({ ask, projects: [flexibeck] }),
      ),
      fetchMineAsks: vi.fn((project) => {
        const asked = ask?.step === 'check' ? 'glue' : 'flexibeck'
        return Promise.resolve(ask && project === asked ? [ask] : [])
      }),
      addAsk: vi.fn(() => {
        ask = {
          id: 1,
          kind: 'insight',
          step: 'pick',
          part: {
            project: { slug: 'glue', name: 'Glue' },
            id: 'I3',
            type: 'insight',
            title: I3,
            trust: 'solid',
            concept: 'part-model',
          },
          project: flexibeck,
          question: null,
          askedBy: { name: 'Ada', email: 'ada@example.com' },
          pickedBy: null,
          handedBack: null,
          askedAt: '2026-10-03T12:00:00.000Z',
        }
        return Promise.resolve({ id: 1 })
      }),
      pickAsk: vi.fn(() => {
        ask = ask && {
          ...ask,
          step: 'hand-back',
          pickedBy: { name: 'Bo', email: 'bo@example.com' },
        }
        return Promise.resolve(undefined)
      }),
      handBackAsk: vi.fn(({ part }) => {
        ask = ask && {
          ...ask,
          step: 'check',
          handedBack: {
            project: flexibeck,
            id: part,
            type: 'insight',
            title: study.title,
            trust: 'solid',
            concept: 'flexibeck',
          },
        }
        return Promise.resolve(undefined)
      }),
      addJoint: vi.fn(() => {
        ask = null
        return Promise.resolve({ id: 20 })
      }),
    }

    // Ada asks flexibeck to check her Hunch.
    await renderPage('/glue/part-model/I3', asking)
    await act('Ask another team')
    await userEvent.selectOptions(
      // The frame has the Project switch with the same name.
      within(screen.getByRole('main')).getByRole('combobox', {
        name: 'Project',
      }),
      'flexibeck',
    )
    await userEvent.click(button('Send'))

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Ask another team' }))
          .getAllByRole('button')
          .find((step) => step.getAttribute('aria-current') === 'step')?.title,
      ).toBe('Pick'),
    )
    expect(asking.addAsk).toHaveBeenCalledExactlyOnceWith({
      project: 'glue',
      ask: { kind: 'insight', part: 'I3', toProject: 'flexibeck' },
    })
    cleanup()

    // Bo picks the Ask in Mine of flexibeck, and hands back his Insight.
    await renderPage('/flexibeck?section=Mine', {
      ...asking,
      fetchSession: vi.fn(() => Promise.resolve(bo)),
      fetchPeople: vi.fn(() => Promise.resolve({ ...people, me: 2 })),
    })

    expect(section('Mine 1')).toBeDefined()
    expect(mineAsks()).toEqual([[`Solid Insight I3 ${I3} Glue`, 'Pick']])

    await userEvent.click(button('Pick'))

    await waitFor(() =>
      expect(mineAsks()).toEqual([
        [`Solid Insight I3 ${I3} Glue`, 'Hand back'],
      ]),
    )
    expect(asking.pickAsk).toHaveBeenCalledExactlyOnceWith({
      project: 'flexibeck',
      askId: 1,
    })

    await userEvent.click(button('Hand back'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Insight' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'I1 Agents skip long files' }),
    )

    await waitFor(() => expect(mineAsks()).toEqual([]))
    expect(asking.handBackAsk).toHaveBeenCalledExactlyOnceWith({
      project: 'flexibeck',
      askId: 1,
      part: 'I1',
    })
    cleanup()

    // Ada checks the Insight in Mine of Glue, and glues it to her Hunch.
    await renderPage('/glue?section=Mine', asking)

    expect(mineAsks()).toEqual([
      [
        `Solid Insight I1 Agents skip long files I3 ${I3} flexibeck`,
        'Check and glue',
      ],
    ])

    await userEvent.click(button('Check and glue'))

    await waitFor(() => expect(mineAsks()).toEqual([]))
    expect(asking.addJoint).toHaveBeenCalledExactlyOnceWith({
      project: 'glue',
      joint: { part: 'I3', needs: 'flexibeck/I1' },
    })
  })

  // The Ask of Glue to flexibeck that nobody picked.
  const open: Ask = {
    id: 1,
    kind: 'insight',
    step: 'pick',
    part: {
      project: { slug: 'glue', name: 'Glue' },
      id: 'I3',
      type: 'insight',
      title: I3,
      trust: 'solid',
      concept: 'part-model',
    },
    project: flexibeck,
    question: null,
    askedBy: null,
    pickedBy: null,
    handedBack: null,
    askedAt: '2026-10-03T12:00:00.000Z',
  }
  const picked: Ask = {
    ...open,
    step: 'hand-back',
    pickedBy: { name: 'Bo', email: 'bo@example.com' },
  }
  const handedBack: Ask = {
    ...picked,
    step: 'check',
    handedBack: {
      project: flexibeck,
      id: 'I1',
      type: 'insight',
      title: study.title,
      trust: 'solid',
      concept: 'flexibeck',
    },
  }
  // The Hunch of Glue with the Ask.
  const hunchWith = (ask: Ask | null): Partial<Server> => ({
    fetchAskState: vi.fn(() => Promise.resolve({ ask, projects: [flexibeck] })),
  })
  // Mine of flexibeck, as Bo sees it.
  const mineOfBo = (asks: Array<Ask>): Partial<Server> => ({
    fetchMineAsks: vi.fn(() => Promise.resolve(asks)),
    fetchSession: vi.fn(() => Promise.resolve(bo)),
    fetchPeople: vi.fn(() => Promise.resolve({ ...people, me: 2 })),
  })

  it('sends the Ask with a button, and not with the choice of the Project', async () => {
    const { server } = await renderPage('/glue/part-model/I3', hunchWith(null))
    const choice = () =>
      within(screen.getByRole('main')).queryByRole('combobox', {
        name: 'Project',
      })

    await act('Ask another team')
    await userEvent.selectOptions(
      within(screen.getByRole('main')).getByRole('combobox', {
        name: 'Project',
      }),
      'flexibeck',
    )

    expect(server.addAsk).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')

    expect(choice()).toBeNull()
    expect(server.addAsk).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button('Raise the level'))

    await act('Ask another team')
    await userEvent.click(button('Send'))

    await waitFor(() => expect(choice()).toBeNull())
    // The button is away while the Ask saves, and has the focus after it.
    await waitFor(() =>
      expect(document.activeElement).toBe(button('Raise the level')),
    )
    expect(server.addAsk).toHaveBeenCalledExactlyOnceWith({
      project: 'glue',
      ask: { kind: 'insight', part: 'I3', toProject: 'flexibeck' },
    })
  })

  it('has the last step on the Hunch too: its button glues the Insight that came back', async () => {
    const { server } = await renderPage(
      '/glue/part-model/I3',
      hunchWith(handedBack),
    )

    await userEvent.click(button('Check and glue'))

    await waitFor(() =>
      expect(server.addJoint).toHaveBeenCalledExactlyOnceWith({
        project: 'glue',
        joint: { part: 'I3', needs: 'flexibeck/I1' },
      }),
    )
  })

  it('takes the Ask back while nobody picked it', async () => {
    const { server } = await renderPage('/glue/part-model/I3', hunchWith(open))

    await act('Take back')

    await waitFor(() =>
      expect(server.takeBackAsk).toHaveBeenCalledExactlyOnceWith({
        project: 'glue',
        askId: 1,
      }),
    )
  })

  it('does not take back the Ask of a Hunch that another member has', async () => {
    await renderPage('/glue/part-model/I3', {
      ...hunchWith(open),
      fetchPeople: vi.fn(() =>
        Promise.resolve({
          ...people,
          assignments: [...people.assignments, ofBo],
        }),
      ),
    })

    await expect(act('Take back')).rejects.toThrow('No action Take back')
  })

  const ada = { name: 'Ada', email: 'ada@example.com' }
  const ofBo: (typeof people.assignments)[number] = {
    id: 3,
    memberId: 2,
    role: 'responsible',
    concept: null,
    part: 'I3',
  }

  it('lets the member who made the Ask take it back, with the Hunch of another member', async () => {
    const { server } = await renderPage('/glue/part-model/I3', {
      ...hunchWith({ ...open, askedBy: ada }),
      fetchPeople: vi.fn(() =>
        Promise.resolve({
          ...people,
          assignments: [...people.assignments, ofBo],
        }),
      ),
    })

    await act('Take back')

    await waitFor(() =>
      expect(server.takeBackAsk).toHaveBeenCalledExactlyOnceWith({
        project: 'glue',
        askId: 1,
      }),
    )
  })

  it('does not take back the Ask that another member made', async () => {
    await renderPage(
      '/glue/part-model/I3',
      hunchWith({
        ...open,
        askedBy: { name: 'Bo', email: 'bo@example.com' },
      }),
    )

    await expect(act('Take back')).rejects.toThrow('No action Take back')
  })

  it('asks for a Decision from a Guardrail, and Bo hands a Decision back', async () => {
    const question = 'How long may a query of the map take?'
    // The published Decision of flexibeck that Bo hands back.
    const decided: LeveledPart = {
      ...parts[2],
      id: 'D1',
      title: 'The map loads in two steps',
      concept: 'flexibeck',
      conceptTitle: 'flexibeck',
    }
    const asked: Ask = {
      ...picked,
      kind: 'decision',
      part: {
        ...open.part,
        id: 'R1',
        type: 'guardrail',
        title: R1,
        concept: 'read-model',
      },
      question,
      askedBy: ada,
    }

    const { server } = await renderPage('/glue/read-model/R1', hunchWith(null))
    await act('Ask for a Decision')
    await userEvent.click(button('Send'))

    // An Ask for a Decision waits for its question.
    expect(server.addAsk).not.toHaveBeenCalled()

    await userEvent.type(field('Question'), question)
    await userEvent.click(button('Send'))

    await waitFor(() =>
      expect(server.addAsk).toHaveBeenCalledExactlyOnceWith({
        project: 'glue',
        ask: {
          kind: 'decision',
          part: 'R1',
          toProject: 'flexibeck',
          question,
        },
      }),
    )
    cleanup()

    const mine = await renderPage('/flexibeck?section=Mine', {
      ...mineOfBo([asked]),
      fetchParts: vi.fn(() => Promise.resolve([study, decided])),
    })

    expect(mineAsks()).toEqual([
      [`Solid Guardrail R1 ${R1} ${question} Glue`, 'Hand back'],
    ])

    await userEvent.click(button('Hand back'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Decision' }))

    // Only a Decision goes back.
    expect(
      screen.getAllByRole('option').map(({ textContent }) => textContent),
    ).toEqual(['D1 The map loads in two steps'])

    await userEvent.click(
      screen.getByRole('option', { name: 'D1 The map loads in two steps' }),
    )

    await waitFor(() =>
      expect(mine.server.handBackAsk).toHaveBeenCalledExactlyOnceWith({
        project: 'flexibeck',
        askId: 1,
        part: 'D1',
      }),
    )
  })

  it('does not take back an Ask that a member picked', async () => {
    await renderPage('/glue/part-model/I3', hunchWith(picked))

    await expect(act('Take back')).rejects.toThrow('No action Take back')
  })

  it('gives a member with no published Insight the step to add one', async () => {
    const { expectAddress } = await renderPage('/flexibeck?section=Mine', {
      ...mineOfBo([picked]),
      fetchParts: vi.fn(() => Promise.resolve([])),
    })

    expect(mineAsks()).toEqual([[`Solid Insight I3 ${I3} Glue`, 'Add Insight']])

    await userEvent.click(button('Add Insight'))

    await expectAddress('/flexibeck', { section: 'Mine', add: 'insight' })
  })

  it('turns the steps of all Asks off while one step saves', async () => {
    const other = { ...open, id: 2, part: { ...open.part, id: 'I4' } }
    await renderPage('/flexibeck?section=Mine', {
      ...mineOfBo([open, other]),
      pickAsk: vi.fn(() => new Promise<undefined>(() => {})),
    })
    const steps = () =>
      within(screen.getByRole('list', { name: 'Asks' }))
        .getAllByRole<HTMLButtonElement>('button', { name: 'Pick' })
        .map(({ disabled }) => disabled)

    expect(steps()).toEqual([false, false])

    await userEvent.click(
      within(screen.getByRole('list', { name: 'Asks' })).getAllByRole(
        'button',
        { name: 'Pick' },
      )[0],
    )

    await waitFor(() => expect(steps()).toEqual([true, true]))
  })
})
