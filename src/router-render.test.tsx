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

import type {
  MeasuredPart,
  Part,
  PartMeasure,
  PartSummary,
} from './db/parts.ts'
import { createRouterContext } from './router-context.ts'
import type { Server } from './router-server.ts'
import { routeTree } from './routeTree.gen'
import { findPart, parts, people } from './test/project.ts'
import './test/render.tsx'
import { createMemoryServer } from './test/server.ts'

// jsdom has no layout, Carbon's dropdown scrolls to the highlighted item.
Element.prototype.scrollIntoView = () => {}

// The Signals of Glue: one grew into I3, one grew into nothing yet.
const signals = [
  {
    url: 'https://github.com/timschoch/glue/issues/7',
    title: 'The list is slow',
    date: '2026-10-02',
    insight: null,
  },
  {
    url: 'https://github.com/timschoch/glue/issues/5',
    title: 'Agents open each file',
    date: '2026-10-01',
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
    fetchSignals: vi.fn(() => Promise.resolve({ signals, reason: null })),
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
    expect(groups()).toEqual(['Insights', 'Signals'])
    expect(section('Understand').getAttribute('aria-current')).toBe('page')

    await userEvent.click(section('Understand'))

    await expectAddress('/glue/part-model')
    expect(groups()).toEqual(all)
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
    const G2: PartSummary = {
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

  it('shows no count and no card without a Part', async () => {
    await renderPage('/glue?section=Mine')

    expect(pageTitle()).toBe('Mine')
    expect(section('Mine').getAttribute('aria-current')).toBe('page')
    expect(within(screen.getByRole('main')).queryByRole('link')).toBeNull()
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
    const { expectAddress } = await renderPage('/glue?section=Use', {
      fetchMeasured: vi.fn(() => Promise.resolve(measured)),
    })

    expect(pageTitle()).toBe('Use')
    expect(card('G1').textContent).toContain('30% Target 25%')
    expect(within(card('G1')).getByLabelText('On target')).toBeDefined()
    expect(card('M1').textContent).toContain('10% Target 25%')
    expect(within(card('M1')).getByLabelText('Off target')).toBeDefined()

    await userEvent.click(card('M1'))

    await expectAddress('/glue/part-model/M1', { section: 'Use' })
  })

  it('shows an empty slot for a Metric with no reading', async () => {
    await renderPage('/glue?section=Use', {
      fetchMeasured: vi.fn(() => Promise.resolve(measured)),
    })

    expect(card('M2').textContent).toContain('Reading')
    expect(within(card('M2')).queryByLabelText(/target/)).toBeNull()
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
})

describe('the answers of an Insight in draft', () => {
  const draft = {
    fetchPart: vi.fn(
      changedPart('I3', {
        status: 'draft',
        trust: 'not-ready',
        workState: 'draft',
        answers: ['supersede', 'not-ready', 'sink'],
      }),
    ),
  }

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
