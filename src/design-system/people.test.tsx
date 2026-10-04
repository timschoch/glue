// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { People } from './people.tsx'
import type { PeopleProps } from './people.tsx'

afterEach(cleanup)

const nothing = { concepts: [], parts: [] }

const MEMBERS: PeopleProps['members'] = [
  {
    id: 1,
    name: 'Ada',
    email: 'ada@example.com',
    loopSteps: ['decide', 'build'],
    responsible: {
      concepts: [
        { slug: 'checkout', title: 'Checkout', href: '/glue/checkout' },
      ],
      parts: [
        {
          id: 'D12',
          type: 'decision',
          title: 'Show the video of the creator',
          trust: 'solid',
          href: '/glue/checkout/D12',
        },
      ],
    },
    coAuthor: nothing,
  },
  {
    id: 2,
    name: 'Bo',
    email: 'bo@example.com',
    loopSteps: ['understand'],
    responsible: nothing,
    coAuthor: {
      concepts: [],
      parts: [
        {
          id: 'I7',
          type: 'insight',
          title: 'Bakers want step videos',
          trust: 'not-ready',
          href: '/glue/checkout/I7',
        },
      ],
    },
  },
]

function member(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('People', () => {
  it('shows each member with the e-mail address and the loop steps', () => {
    render(<People members={MEMBERS} me={null} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('People')
    expect(member('Ada').getByText('ada@example.com')).toBeTruthy()
    expect(member('Ada').getByText('Decide, Build')).toBeTruthy()
    expect(member('Bo').getByText('Understand')).toBeTruthy()
  })

  it('shows the Concepts and the Parts of a member, by role', () => {
    render(<People members={MEMBERS} me={null} />)

    const responsible = within(
      member('Ada').getByRole('list', { name: 'Responsible' }),
    )
    expect(
      responsible.getByRole('link', { name: /Checkout/ }).getAttribute('href'),
    ).toBe('/glue/checkout')
    expect(
      responsible
        .getByRole('link', { name: /Show the video of the creator/ })
        .getAttribute('href'),
    ).toBe('/glue/checkout/D12')
    expect(member('Ada').queryByRole('list', { name: 'Co-Author' })).toBeNull()
    expect(
      within(member('Bo').getByRole('list', { name: 'Co-Author' })).getByRole(
        'link',
        { name: /Bakers want step videos/ },
      ),
    ).toBeTruthy()
  })

  it('lets the member set the own loop steps, and no other ones', async () => {
    const onLoopStepsChange = vi.fn()
    render(
      <People members={MEMBERS} me={1} onLoopStepsChange={onLoopStepsChange} />,
    )

    const steps = member('Ada').getAllByRole('checkbox')
    expect(steps.map((step) => (step as HTMLInputElement).checked)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ])
    expect(member('Bo').queryAllByRole('checkbox')).toEqual([])

    await userEvent.click(member('Ada').getByRole('checkbox', { name: 'Use' }))
    await userEvent.click(
      member('Ada').getByRole('checkbox', { name: 'Decide' }),
    )

    expect(onLoopStepsChange.mock.calls).toEqual([
      [['decide', 'build', 'use']],
      [['build']],
    ])
  })

  it('adds a member by the e-mail address', async () => {
    const onAddMember = vi.fn()
    render(<People members={MEMBERS} me={1} onAddMember={onAddMember} />)

    await userEvent.type(
      screen.getByRole('textbox', { name: 'E-mail' }),
      ' cy@example.com ',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))

    expect(onAddMember).toHaveBeenCalledExactlyOnceWith('cy@example.com')
  })

  it('shows no field to add a member to a person who reads only', () => {
    render(<People members={MEMBERS} me={null} />)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add member' })).toBeNull()
  })

  it('says why a write failed', () => {
    render(
      <People
        members={MEMBERS}
        me={1}
        onAddMember={() => {}}
        error="No account has the e-mail address cy@example.com."
      />,
    )

    // The Carbon field holds an empty alert for its counter. Carbon names its
    // icon in the alert.
    expect(
      screen
        .getAllByRole('alert')
        .map((alert) => alert.textContent)
        .filter((text) => text !== ''),
    ).toEqual(['error iconNo account has the e-mail address cy@example.com.'])
  })
})
