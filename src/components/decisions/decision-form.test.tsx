// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Failure } from '../../authentication/session.ts'
import type { Concept, Decision } from '../../db/concept.ts'
import type { DecisionProposal } from '../../db/decision-proposal.ts'
import { renderInRouter } from '../../test/render.tsx'
import { DecisionForm } from './decision-form.tsx'

const concept: Concept = {
  product: { slug: 'glue', name: 'Glue' },
  goals: [
    {
      id: 'G1',
      title: 'Agents build from the Concept',
      metric: 'Tickets',
      status: 'open',
      latestValue: null,
    },
    {
      id: 'G2',
      title: 'The Owner decides fast',
      metric: 'Days',
      status: 'open',
      latestValue: null,
    },
  ],
  decisions: [],
  guardrails: [],
  insights: [
    {
      id: 'I1',
      title: 'Agents skip long documents',
      date: '2026-01-10',
      status: null,
    },
    {
      id: 'I2',
      title: 'The build failed',
      date: '2026-03-02',
      status: 'draft',
    },
  ],
  facts: [{ id: 'F1', title: 'An export is one request' }],
}

const superseded: Decision = {
  kind: 'decision',
  id: 'D4',
  title: 'The Concept lives in files',
  date: '2026-01-15',
  owner: 'Grace',
  status: 'accepted',
  body: 'Files are easy to read.',
  goal: { id: 'G2', title: 'The Owner decides fast' },
  evidence: [
    { id: 'I1', title: 'Agents skip long documents' },
    { id: 'F1', title: 'An export is one request' },
  ],
  supersededBy: null,
  supersedes: [],
  issueUrl: null,
}

type Submit = (proposal: DecisionProposal) => Promise<Failure | undefined>

function renderForm({
  onPropose = () => Promise.resolve(undefined),
  ...props
}: {
  onPropose?: Submit
  concept?: Concept
  evidence?: string
  superseded?: Decision
} = {}) {
  return renderInRouter(
    <DecisionForm
      concept={concept}
      owner="Ada"
      onPropose={onPropose}
      {...props}
    />,
  )
}

function field(name: string) {
  return screen.getByRole<HTMLInputElement>('textbox', { name })
}

function evidence() {
  return within(screen.getByRole('group', { name: 'Evidence' }))
}

function checked() {
  return evidence()
    .getAllByRole<HTMLInputElement>('checkbox')
    .filter((box) => box.checked)
    .map((box) => box.value)
}

async function fill() {
  await userEvent.type(field('Title'), 'The Concept lives in the database')
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Goal' }),
    'G1',
  )
  await userEvent.click(evidence().getByRole('checkbox', { name: /^I2/ }))
  await userEvent.click(evidence().getByRole('checkbox', { name: /^F1/ }))
  await userEvent.type(field('Reason (optional)'), 'Files do not scale.')
}

describe('DecisionForm', () => {
  it('proposes a Decision for the Product', async () => {
    await renderForm()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Propose a Decision',
    )
    expect(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    ).toBeDefined()
  })

  it('has the name of the signed-in person as the owner', async () => {
    await renderForm()

    expect(field('Owner').value).toBe('Ada')
  })

  it('offers each Goal, and each Insight and Fact as evidence', async () => {
    await renderForm()

    expect(
      within(screen.getByRole('combobox', { name: 'Goal' }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Pick a Goal',
      'G1 Agents build from the Concept',
      'G2 The Owner decides fast',
    ])
    expect(
      evidence()
        .getAllByRole<HTMLInputElement>('checkbox')
        .map((box) => box.value),
    ).toEqual(['I1', 'I2', 'F1'])
    expect(checked()).toEqual([])
  })

  it('starts with the Insight that the Decision comes from as evidence', async () => {
    await renderForm({ evidence: 'I2' })

    expect(checked()).toEqual(['I2'])
  })

  it('sends the Decision as the person wrote it', async () => {
    const onPropose = vi.fn<Submit>(() => Promise.resolve(undefined))
    await renderForm({ onPropose })

    await fill()
    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    expect(onPropose).toHaveBeenCalledExactlyOnceWith({
      title: 'The Concept lives in the database',
      goal: 'G1',
      evidence: ['I2', 'F1'],
      body: 'Files do not scale.',
      owner: 'Ada',
      supersedes: undefined,
    })
  })

  it('says how to fix each field, and puts the focus in the first one', async () => {
    const onPropose = vi.fn<Submit>(() => Promise.resolve(undefined))
    await renderForm({ onPropose })

    await userEvent.clear(field('Owner'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    expect(screen.getByText('Enter a title.')).toBeDefined()
    expect(
      screen.getByText('Pick the Goal that the Decision serves.'),
    ).toBeDefined()
    expect(screen.getByText('Pick one Insight or Fact or more.')).toBeDefined()
    expect(
      screen.getByText('Enter the name of the person who owns the Decision.'),
    ).toBeDefined()
    expect(document.activeElement).toBe(field('Title'))
    expect(onPropose).not.toHaveBeenCalled()
  })

  it('puts the focus in the evidence when only the evidence is missing', async () => {
    await renderForm()

    await userEvent.type(field('Title'), 'A title')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Goal' }),
      'G1',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    expect(document.activeElement).toBe(evidence().getAllByRole('checkbox')[0])
    expect(
      screen
        .getByRole('group', { name: 'Evidence' })
        .getAttribute('aria-describedby'),
    ).toBe(screen.getByText('Pick one Insight or Fact or more.').id)
  })

  it('says what it does during the request, and takes no second request', async () => {
    let finish = () => {}
    const onPropose = vi.fn<Submit>(
      () => new Promise((resolve) => (finish = () => resolve(undefined))),
    )
    await renderForm({ onPropose })

    await fill()
    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Saving the Decision',
      }).disabled,
    ).toBe(true)

    finish()

    expect(
      await screen.findByRole('button', { name: 'Propose the Decision' }),
    ).toBeDefined()
    expect(onPropose).toHaveBeenCalledOnce()
  })

  it('says which rule the Decision breaks', async () => {
    await renderForm({
      onPropose: () => Promise.resolve({ message: 'evidence "I2" not found' }),
    })

    await fill()
    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    expect((await screen.findByRole('alert')).textContent).toBe(
      'evidence "I2" not found',
    )
  })

  it('says when the request did not reach the server', async () => {
    await renderForm({ onPropose: () => Promise.reject(new Error('offline')) })

    await fill()
    await userEvent.click(
      screen.getByRole('button', { name: 'Propose the Decision' }),
    )

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The Decision is not saved. Check your connection, then try again.',
    )
  })

  it('goes back to the Concept on Cancel', async () => {
    await renderForm()

    expect(
      screen.getByRole('link', { name: 'Cancel' }).getAttribute('href'),
    ).toBe('/glue')
  })

  describe('for a Decision that supersedes another', () => {
    it('starts with the text of the old Decision, and the signed-in person as owner', async () => {
      await renderForm({ superseded })

      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        'Supersede D4 The Concept lives in files',
      )
      expect(field('Title').value).toBe('The Concept lives in files')
      expect(
        screen.getByRole<HTMLSelectElement>('combobox', { name: 'Goal' }).value,
      ).toBe('G2')
      expect(checked()).toEqual(['I1', 'F1'])
      expect(field('Reason (optional)').value).toBe('Files are easy to read.')
      expect(field('Owner').value).toBe('Ada')
    })

    it('says what happens to the two Decisions', async () => {
      await renderForm({ superseded })

      expect(
        screen.getByText(
          'The new Decision is accepted when you save it. D4 becomes superseded.',
        ),
      ).toBeDefined()
    })

    it('sends the Decision with the id of the old one', async () => {
      const onPropose = vi.fn<Submit>(() => Promise.resolve(undefined))
      await renderForm({ onPropose, superseded })

      await userEvent.clear(field('Title'))
      await userEvent.type(field('Title'), 'The Concept lives in the database')
      await userEvent.click(
        screen.getByRole('button', { name: 'Supersede D4' }),
      )

      expect(onPropose).toHaveBeenCalledExactlyOnceWith({
        title: 'The Concept lives in the database',
        goal: 'G2',
        evidence: ['I1', 'F1'],
        body: 'Files are easy to read.',
        owner: 'Ada',
        supersedes: 'D4',
      })
    })

    it('goes back to the old Decision on Cancel', async () => {
      await renderForm({ superseded })

      expect(
        screen.getByRole('link', { name: 'Cancel' }).getAttribute('href'),
      ).toBe('/glue/concept/D4')
    })
  })

  it.each([
    [
      { ...concept, goals: [] },
      'A Decision serves a Goal. This Concept has no Goal yet.',
    ],
    [
      { ...concept, insights: [], facts: [] },
      'A Decision links to its evidence. This Concept has no Insight and no Fact yet.',
    ],
  ])(
    'has no fields when the Concept cannot have a Decision',
    async (bare, text) => {
      await renderForm({ concept: bare })

      expect(screen.getByText(text)).toBeDefined()
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.queryByRole('button')).toBeNull()
    },
  )
})
