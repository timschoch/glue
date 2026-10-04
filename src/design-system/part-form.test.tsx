// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { PartForm } from './part-form.tsx'
import type { PartFormPart, PartFormProps } from './part-form.tsx'

const PARTS: Array<PartFormPart> = [
  {
    id: 'G2',
    type: 'goal',
    title: 'First bake feels easy',
    trust: 'solid',
    href: '#G2',
  },
  {
    id: 'G3',
    type: 'goal',
    title: 'Bakers come back',
    trust: 'flagged',
    href: '#G3',
  },
  {
    id: 'I7',
    type: 'insight',
    title: 'Bakers want step videos',
    trust: 'solid',
    href: '#I7',
  },
  {
    id: 'I9',
    type: 'insight',
    title: 'Videos are too long',
    trust: 'not-ready',
    href: '#I9',
  },
  {
    id: 'R4',
    type: 'guardrail',
    title: 'Only the videos of the creator',
    trust: 'solid',
    href: '#R4',
  },
  {
    id: 'D5',
    type: 'decision',
    title: 'Bake with a video',
    trust: 'solid',
    href: '#D5',
  },
]

// The values of a Decision that the form can save.
const DECISION = {
  title: 'Show the video of the creator',
  owner: 'Mara',
  date: '2026-10-03',
  goal: 'G2',
  evidence: ['I7', 'I9'],
}

// Carbon's text area watches its size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

afterEach(cleanup)

function renderForm(props: Partial<PartFormProps> = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(
    <PartForm
      type="decision"
      parts={PARTS}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSave, onCancel }
}

// The names of the fields, in the order of the document.
function labels(): Array<string> {
  return [...screen.getByRole('form').querySelectorAll('label')].map(
    (label) => label.textContent,
  )
}

const field = (name: string) => screen.getByRole('textbox', { name })

const picker = (name: string) => screen.getByRole('combobox', { name })

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save' })

// The titles of the cards of the picked Parts of a picker.
function picks(name: string): Array<string | null> {
  const list = screen.queryByRole('list', { name })
  return list
    ? within(list)
        .getAllByRole('link')
        .map((card) => card.querySelector('p')?.textContent ?? null)
    : []
}

// The texts of the alerts. Each Carbon field holds an empty one for its
// counter.
function alerts(): Array<string> {
  return screen
    .getAllByRole('alert')
    .map((alert) => alert.textContent)
    .filter((text) => text !== '')
}

// An icon button. Its name is its Carbon tooltip, which Testing Library does
// not read while the tooltip is closed.
function iconButton(name: string): HTMLElement {
  const found = screen
    .getAllByRole('button')
    .find(
      (button) =>
        document.getElementById(button.getAttribute('aria-labelledby') ?? '')
          ?.textContent === name,
    )
  if (!found) throw new Error(`The form has no button ${name}`)
  return found
}

// Types into a picker and picks the option that holds the text.
async function pick(name: string, search: string, option: string) {
  await userEvent.type(picker(name), search)
  await userEvent.click(screen.getByRole('option', { name: option }))
}

describe('PartForm', () => {
  it.each([
    ['insight', ['Title', 'Body', 'Source', 'Date', 'Evidence level']],
    ['goal', ['Title', 'Body', 'Metric', 'Source']],
    ['decision', ['Title', 'Body', 'Owner', 'Date', 'Goal', 'Evidence']],
    ['guardrail', ['Title', 'Body', 'Enforced by']],
    ['entity', ['Title', 'Body']],
    ['flow', ['Title', 'Body']],
    ['metric', ['Title', 'Body']],
  ] as const)('shows the fields of a %s, and no other', (type, names) => {
    renderForm({ type })

    expect(labels()).toEqual(names)
  })

  it('has no field for the Joints of a Decision that exists', () => {
    renderForm({
      recordId: 'D12',
      values: { title: 'Loop', owner: 'Mara', date: '2026-10-03' },
    })

    expect(labels()).toEqual(['Title', 'Body', 'Owner', 'Date'])
    expect(saveButton().disabled).toBe(false)
  })

  it('names the Part type as text, not as a field', () => {
    renderForm({ type: 'guardrail' })

    expect(screen.getByRole('form', { name: 'Guardrail' })).toBeDefined()
    expect(screen.queryByLabelText(/type/i)).toBeNull()
  })

  it('names the record id of the Part it edits', () => {
    renderForm({ recordId: 'D12' })

    expect(screen.getByRole('form', { name: 'Decision D12' })).toBeDefined()
  })

  it('shows no helper text', () => {
    renderForm()

    expect(document.querySelector('[class*="helper-text"]')).toBeNull()
  })

  it('has one primary button to save and one ghost button to cancel', () => {
    renderForm({ type: 'entity', values: { title: 'Technique' } })

    const buttons = screen.getAllByRole('button')

    expect(
      buttons.filter((button) => button.className.includes('btn--primary')),
    ).toEqual([saveButton()])
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain(
      'btn--ghost',
    )
  })

  it('saves an Entity when the title has a value', async () => {
    const { onSave } = renderForm({ type: 'entity' })

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(field('Title'), 'Technique')
    await userEvent.type(field('Body'), 'A baking **task**.')

    expect(saveButton().disabled).toBe(false)

    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: 'Technique',
        body: 'A baking **task**.',
      }),
    )
  })

  it('does not take a title of spaces as a value', async () => {
    renderForm({ type: 'entity' })

    await userEvent.type(field('Title'), '   ')

    expect(saveButton().disabled).toBe(true)
  })

  it('saves a Goal when the title, the metric and the source have a value', async () => {
    const { onSave } = renderForm({ type: 'goal' })

    await userEvent.type(field('Title'), 'First bake feels easy')
    await userEvent.type(field('Metric'), 'Ease of the first bake')

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(field('Source'), 'Survey after the first bake')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        metric: 'Ease of the first bake',
        source: 'Survey after the first bake',
      }),
    )
  })

  it('saves an Insight when the title, the source and the date have a value', async () => {
    const { onSave } = renderForm({ type: 'insight' })

    await userEvent.type(field('Title'), 'Bakers want step videos')
    await userEvent.type(field('Source'), 'Interviews, May')

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(field('Date'), '2026-10-03')
    await userEvent.selectOptions(picker('Evidence level'), 'Pattern')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: 'Interviews, May',
        date: '2026-10-03',
        evidenceLevel: 'pattern',
      }),
    )
  })

  it('saves a Guardrail when the title and what enforces it have a value', async () => {
    const { onSave } = renderForm({ type: 'guardrail' })

    await userEvent.type(field('Title'), 'Only the videos of the creator')

    expect(saveButton().disabled).toBe(true)

    await userEvent.type(field('Enforced by'), 'A test of the player')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ enforcedBy: 'A test of the player' }),
    )
  })

  it('saves a Decision when the title, the owner and the date have a value, and the Goal and the evidence a pick', async () => {
    const { onSave } = renderForm()

    await userEvent.type(field('Title'), 'Show the video of the creator')
    await userEvent.type(field('Owner'), 'Mara')
    await userEvent.type(field('Date'), '2026-10-03')

    expect(saveButton().disabled).toBe(true)

    await pick('Goal', 'easy', 'G2 First bake feels easy')

    expect(saveButton().disabled).toBe(true)

    await pick('Evidence', 'I7', 'I7 Bakers want step videos')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      title: 'Show the video of the creator',
      body: '',
      metric: '',
      source: '',
      owner: 'Mara',
      date: '2026-10-03',
      evidenceLevel: null,
      enforcedBy: '',
      goal: 'G2',
      evidence: ['I7'],
    })
  })

  it('cancels with the ghost button', async () => {
    const { onSave, onCancel } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows the words of the action in the place of the save button while it saves, and saves no second time', async () => {
    const { onSave, onCancel } = renderForm({
      type: 'entity',
      values: { title: 'Technique' },
      pending: true,
    })

    expect(screen.getByText('Saving')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(document.querySelector('[class*="skeleton"]')).toBeNull()

    await userEvent.type(field('Title'), '{Enter}')

    expect(onSave).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows no words of an action while it does not save', () => {
    renderForm()

    expect(screen.queryByText('Saving')).toBeNull()
  })

  it('offers the Goals to the Goal picker, and the Insights, the Guardrails and the Decisions to the evidence picker', async () => {
    renderForm()

    await userEvent.click(picker('Goal'))

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['G2 First bake feels easy', 'G3 Bakers come back'])

    await userEvent.click(picker('Evidence'))

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'I7 Bakers want step videos',
      'I9 Videos are too long',
      'R4 Only the videos of the creator',
      'D5 Bake with a video',
    ])
  })

  it('puts the record id of a pick after # into the body', async () => {
    const { onSave } = renderForm({ type: 'entity', recordId: 'I7' })

    await userEvent.type(field('Title'), 'Technique')
    await userEvent.type(field('Body'), 'See #i9')

    // jsdom has no layout, so Carbon holds the list back as hidden.
    expect(
      screen
        .getAllByRole('option', { hidden: true })
        .map((option) => option.textContent),
    ).toEqual(['Insight I9 Videos are too long'])

    await userEvent.keyboard('{Enter}')
    await userEvent.click(saveButton())

    expect(onSave.mock.calls[0][0].body).toBe('See #I9')
  })

  it.each([
    ['the record id', 'i9'],
    ['the title', 'too long'],
  ])('searches the Parts by %s', async (_, search) => {
    renderForm()

    await userEvent.type(picker('Evidence'), search)

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['I9 Videos are too long'])
  })

  it('shows each pick as a minimal card, and offers it no more', async () => {
    renderForm()

    await pick('Evidence', 'I7', 'I7 Bakers want step videos')

    const [card] = within(
      screen.getByRole('list', { name: 'Evidence' }),
    ).getAllByRole('link')

    expect(card.getAttribute('href')).toBe('#I7')
    expect(within(card).getByRole('img', { name: 'Solid' })).toBeDefined()
    expect(card.textContent).toBe('Solid Insight I7 Bakers want step videos')
    expect(picker('Evidence')).toHaveProperty('value', '')

    await userEvent.click(picker('Evidence'))

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'I9 Videos are too long',
      'R4 Only the videos of the creator',
      'D5 Bake with a video',
    ])
  })

  it('removes a pick with the one icon button of its card, named with the record id', async () => {
    const { onSave } = renderForm({ values: DECISION })

    expect(picks('Goal')).toEqual(['First bake feels easy'])
    expect(picks('Evidence')).toEqual([
      'Bakers want step videos',
      'Videos are too long',
    ])

    const [first] = within(
      screen.getByRole('list', { name: 'Evidence' }),
    ).getAllByRole('listitem')

    expect(within(first).getAllByRole('button')).toEqual([
      iconButton('Remove I7'),
    ])
    expect(iconButton('Remove I7').querySelectorAll('svg')).toHaveLength(1)

    await userEvent.click(iconButton('Remove I7'))

    expect(picks('Evidence')).toEqual(['Videos are too long'])

    await userEvent.click(saveButton())

    expect(onSave.mock.calls[0][0].evidence).toEqual(['I9'])
  })

  it('offers a removed pick again', async () => {
    renderForm()

    await pick('Evidence', 'I7', 'I7 Bakers want step videos')
    await userEvent.click(iconButton('Remove I7'))
    await pick('Evidence', 'I7', 'I7 Bakers want step videos')

    expect(picks('Evidence')).toEqual(['Bakers want step videos'])
  })

  it('holds one Goal: the search gives its place to the label while the Goal has a pick', async () => {
    renderForm()

    await pick('Goal', 'G3', 'G3 Bakers come back')

    expect(picks('Goal')).toEqual(['Bakers come back'])
    expect(screen.queryByRole('combobox', { name: 'Goal' })).toBeNull()
    expect(
      screen.getByText('Goal', { selector: '[class*="pickerLabel"]' }),
    ).toBeDefined()

    await userEvent.click(iconButton('Remove G3'))

    expect(picker('Goal')).toHaveProperty('value', '')
  })

  it('does not save a Decision after its Goal is removed', async () => {
    renderForm({ values: DECISION })

    expect(saveButton().disabled).toBe(false)

    await userEvent.click(iconButton('Remove G2'))

    expect(picks('Goal')).toEqual([])
    expect(saveButton().disabled).toBe(true)
  })

  it('does not save a Decision after its last evidence is removed', async () => {
    renderForm({ values: { ...DECISION, evidence: ['I7'] } })

    expect(saveButton().disabled).toBe(false)

    await userEvent.click(iconButton('Remove I7'))

    expect(saveButton().disabled).toBe(true)
  })

  it('opens the record of a pick', async () => {
    const onOpen = vi.fn()
    renderForm({ values: { goal: 'G2' }, onOpen })

    await userEvent.click(screen.getByText('First bake feels easy'))

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen.mock.calls[0][0]).toBe('G2')
  })

  it('shows the values of the Part it edits', () => {
    renderForm({
      type: 'insight',
      recordId: 'I7',
      values: {
        title: 'Bakers want step videos',
        body: 'Eight of ten novices stop.',
        source: 'Interviews, May',
        date: '2026-05-12',
        evidenceLevel: 'confirmed',
      },
    })

    expect(field('Title')).toHaveProperty('value', 'Bakers want step videos')
    expect(field('Body')).toHaveProperty('value', 'Eight of ten novices stop.')
    expect(field('Source')).toHaveProperty('value', 'Interviews, May')
    expect(field('Date')).toHaveProperty('value', '2026-05-12')
    expect(picker('Evidence level')).toHaveProperty('value', 'confirmed')
    expect(saveButton().disabled).toBe(false)
  })

  it('shows a wrong value as invalid, with the reason from the caller', () => {
    renderForm({
      values: { title: 'Loop', date: 'tomorrow' },
      errors: {
        date: 'Not a date',
        goal: 'G9 is not a Goal',
        evidence: 'I3 is sunk',
      },
    })

    expect(field('Date').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Not a date')).toBeDefined()
    expect(screen.getByText('G9 is not a Goal')).toBeDefined()
    expect(screen.getByText('I3 is sunk')).toBeDefined()
    expect(field('Title').getAttribute('aria-invalid')).not.toBe('true')
  })

  it('shows an error of the server as one notification', () => {
    renderForm({ serverError: 'The record id D12 is taken' })

    // Carbon names its icon in the alert.
    expect(alerts()).toEqual(['error iconThe record id D12 is taken'])
  })

  it('shows no notification without an error of the server', () => {
    renderForm()

    expect(alerts()).toEqual([])
  })
})
