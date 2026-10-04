// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { ContractPanel, ContractVersionView } from './contract.tsx'
import type {
  ContractPanelProps,
  ContractVersionViewProps,
} from './contract.tsx'

const CHECKSUM_1 =
  '9f2c4e7a1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd'
const CHECKSUM_2 =
  'a81d03c5e7f9124b6d8fa0c2e4b6d8fa0c2e4b6d8fa0c2e4b6d8fa0c2e4b6d8f'

const VERSIONS: ContractPanelProps['versions'] = [
  {
    version: 2,
    checksum: CHECKSUM_2,
    signedBy: 'Ada',
    signedAt: '2026-10-04T08:30:00.000Z',
  },
  {
    version: 1,
    checksum: CHECKSUM_1,
    signedBy: 'Grace',
    signedAt: '2026-10-01T10:00:00.000Z',
  },
]

const BLOCKING: ContractPanelProps['blocking'] = [
  {
    id: 'F5',
    type: 'flow',
    title: 'Watch a technique while baking',
    trust: 'flagged',
    href: '#F5',
  },
]

afterEach(cleanup)

function renderPanel(props: Partial<ContractPanelProps> = {}) {
  const onSignOff = vi.fn()
  render(
    <ContractPanel
      versions={VERSIONS}
      ahead={false}
      blocking={[]}
      versionHref={(version) => `#version-${version}`}
      onSignOff={onSignOff}
      {...props}
    />,
  )
  return {
    onSignOff,
    panel: within(screen.getByRole('region', { name: 'Contract' })),
  }
}

// The border of an element, as its last rule writes it. jsdom does not
// compute a border that holds `var()`.
function border(element: HTMLElement): string {
  return (
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSStyleRule)
      .map((rule) => ({
        selector: rule.selectorText,
        border: rule.style.getPropertyValue('border'),
      }))
      // Only a class selector: jsdom throws on Carbon's vendor selectors.
      .filter(
        ({ selector, border: value }) =>
          /^\.[\w-]+$/.test(selector) && value !== '',
      )
      .filter(({ selector }) => element.matches(selector))
      .at(-1)?.border ?? ''
  )
}

describe('the Contract of a Concept', () => {
  it('lists the Contract Versions, the newest first, each with its checksum', () => {
    const { panel } = renderPanel()

    const rows = panel.getAllByRole('link')

    expect(rows.map((row) => row.textContent)).toEqual([
      'Version 2 a81d03c5e7f9 Ada 2026-10-04',
      'Version 1 9f2c4e7a1b3d Grace 2026-10-01',
    ])
    expect(rows[0].getAttribute('href')).toBe('#version-2')
  })

  it('has no mark and no action when the Concept is at its Contract', () => {
    const { panel } = renderPanel()

    expect(panel.queryByText('Ahead')).toBeNull()
    expect(panel.queryByRole('button')).toBeNull()
  })

  it('marks a Concept that is ahead of its Contract, and signs it off', async () => {
    const { panel, onSignOff } = renderPanel({ ahead: true })

    await userEvent.click(panel.getByRole('button', { name: 'Sign off' }))

    panel.getByText('Ahead')
    expect(onSignOff).toHaveBeenCalledOnce()
  })

  it('signs off a Concept with no Contract Version', () => {
    const { panel } = renderPanel({ versions: [] })

    expect(panel.queryAllByRole('link')).toEqual([])
    panel.getByRole('button', { name: 'Sign off' })
  })

  it('shows the Parts that block above a sign-off that is not available', () => {
    const { panel } = renderPanel({ ahead: true, blocking: BLOCKING })

    const blocking = within(panel.getByRole('list', { name: 'Blocking' }))
    const card = blocking.getByRole('link', { name: / F5 / })
    const action = panel.getByRole<HTMLButtonElement>('button', {
      name: 'Sign off',
    })

    within(card).getByLabelText('Flagged')
    expect(action.disabled).toBe(true)
    expect(
      card.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows why a sign-off failed', () => {
    const { panel } = renderPanel({
      ahead: true,
      failure: 'sign-off needs Trust solid: F5',
    })

    expect(panel.getByRole('alert').textContent).toContain(
      'sign-off needs Trust solid: F5',
    )
  })
})

const CONTRACT: ContractVersionViewProps['contract'] = {
  title: 'Technique videos',
  kind: 'brief',
  version: 1,
  checksum: CHECKSUM_1,
  signedBy: 'Grace',
  signedAt: '2026-10-01T10:00:00.000Z',
  newestVersion: 1,
  tier1: [
    {
      id: 'F5',
      type: 'flow',
      title: 'Watch a technique while baking',
      body: 'The baker opens a step.\nThe video loops.',
    },
    { id: 'R4', type: 'guardrail', title: 'Only creator videos', body: '' },
  ],
  tier2: [{ id: 'G2', type: 'goal', title: 'First bake feels easy', body: '' }],
  slots: [
    { type: 'insight', filled: false },
    { type: 'goal', filled: true },
    { type: 'metric', filled: false },
    { type: 'flow', filled: true },
  ],
}

function renderVersion(contract: Partial<typeof CONTRACT> = {}) {
  render(
    <ContractVersionView
      contract={{ ...CONTRACT, ...contract }}
      newestHref="#newest"
    />,
  )
}

describe('a Contract Version', () => {
  it('shows the Version, the Concept, the checksum and who signed', () => {
    renderVersion()

    const head = within(screen.getByRole('banner'))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Technique videos',
    )
    head.getByText('Contract Version 1')
    head.getByText(CHECKSUM_1)
    head.getByText('Grace')
    head.getByText('2026-10-01')
  })

  it('shows tier 1 before tier 2, each Part with its text', () => {
    renderVersion()

    const tiers = screen.getAllByRole('region')

    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Tier 1', 'Tier 2'])
    expect(
      within(tiers[0])
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Watch a technique while baking', 'Only creator videos'])
    within(tiers[0]).getByText(/The video loops\./)
    within(tiers[1]).getByText('G2')
  })

  it('is read-only: no button and no field', () => {
    renderVersion()

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the empty slots of a Brief as dashed chips', () => {
    renderVersion()

    const slots = within(screen.getByRole('list', { name: 'Empty slots' }))
    const chips = slots.getAllByRole('listitem')

    expect(chips.map((chip) => chip.textContent)).toEqual(['Insight', 'Metric'])
    expect(border(chips[0])).toContain('dashed')
  })

  it('links a superseded Version to the newest one', () => {
    renderVersion({ newestVersion: 3 })

    const newest = screen.getByRole('link', { name: 'Version 3' })

    expect(newest.getAttribute('href')).toBe('#newest')
  })
})
