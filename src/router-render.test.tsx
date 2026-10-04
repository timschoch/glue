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

import type { Session } from './authentication/session.ts'
import type { Part, PartSummary } from './db/parts.ts'
import { createRouterContext } from './router-context.ts'
import type { Server } from './router-context.ts'
import { routeTree } from './routeTree.gen'
import {
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

const saved = (id: string) => ({
  id,
  concept: 'part-model',
  issueMissing: false,
})

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
  const server: Server = {
    fetchSession: vi.fn(() => Promise.resolve<Session | undefined>(session)),
    fetchProjects: vi.fn(() => Promise.resolve(projects)),
    fetchProject: vi.fn((project) => Promise.resolve(findProject(project))),
    fetchConcept: vi.fn((input) => Promise.resolve(findConcept(input))),
    fetchParts: vi.fn((project) =>
      Promise.resolve(project === 'glue' ? parts : []),
    ),
    fetchMine: vi.fn(() => Promise.resolve<PartSummary[]>([])),
    fetchPart: vi.fn((input) => Promise.resolve(findPart(input))),
    fetchSignals: vi.fn(() => Promise.resolve({ signals, reason: null })),
    addSignalInsight: vi.fn(() => Promise.resolve(saved('I3'))),
    addProject: vi.fn(({ slug }) => Promise.resolve({ slug })),
    addConcept: vi.fn(({ concept }) => Promise.resolve({ slug: concept.slug })),
    addPart: vi.fn(() => Promise.resolve(saved('D4'))),
    updatePart: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    answerPart: vi.fn(({ recordId }) => Promise.resolve(saved(recordId))),
    addJoint: vi.fn(() => Promise.resolve({ id: 20 })),
    removeJoint: vi.fn(() => Promise.resolve(undefined)),
    signIn: vi.fn(() => Promise.resolve(undefined)),
    signUp: vi.fn(() => Promise.resolve(undefined)),
    signOut: vi.fn(() => Promise.resolve()),
    ...changed,
  }
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

  it('has no trail and no pinned column, and a button in the empty slot', async () => {
    await renderPage('/glue/part-model')

    expect(screen.queryByRole('navigation', { name: 'Trail' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Pinned' })).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'Metrics' })).getByRole(
        'button',
        { name: 'Add Metric' },
      ),
    ).toBeDefined()
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

    const all = [
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

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'The list is slow' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Make Insight' }))

    expect(pageTitle()).toBe('Insight')
    const title = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Title',
    })
    expect(title.value).toBe('The list is slow')

    await userEvent.clear(title)
    await userEvent.type(title, 'Long lists are slow')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expectAddress('/glue/part-model/I3', { section: 'Understand' })
    expect(server.addSignalInsight).toHaveBeenCalledWith({
      project: 'glue',
      insight: {
        signals: ['https://github.com/timschoch/glue/issues/7'],
        title: 'Long lists are slow',
        body: '',
        source: 'https://github.com/timschoch/glue/issues/7',
        date: new Date().toISOString().slice(0, 10),
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

    expect(screen.getByRole('heading', { name: 'Signals' })).toBeDefined()
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
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeDefined()
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
    expect(screen.getByText(/^Enter a date, such as /)).toBeDefined()
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

  it('lists the Parts of the Project that need the owner, with the count of the Parts to check beside it', async () => {
    const { expectAddress } = await renderPage('/glue/read-model', {
      fetchMine: vi.fn(() => Promise.resolve(mine)),
    })

    await userEvent.click(section('Mine 1'))

    await expectAddress('/glue/read-model', { section: 'Mine' })
    expect(pageTitle()).toBe('Mine')
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

    expect(flags.getByText('Changed')).toBeDefined()

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

    expect(main.getByText('Wrong')).toBeDefined()
    expect(main.getByText('Sunk')).toBeDefined()
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
    expect(main.getByRole('button', { name: 'Not ready' })).toBeDefined()
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

      expect(screen.getByText(reason)).toBeDefined()
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
