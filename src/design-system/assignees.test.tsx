// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { Assignees } from './assignees.tsx'

afterEach(cleanup)

const MEMBERS = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Bo' },
  { id: 3, name: 'Cy' },
]

describe('Assignees', () => {
  it('shows the Responsible and the Co-Authors to a person who reads only', () => {
    render(<Assignees members={MEMBERS} responsible={1} coAuthors={[2, 3]} />)

    expect(screen.getByText('Responsible').nextSibling?.textContent).toBe('Ada')
    expect(screen.getByText('Co-Authors').nextSibling?.textContent).toBe(
      'Bo, Cy',
    )
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows nothing to a person who reads only when nobody has it', () => {
    const { container } = render(
      <Assignees members={MEMBERS} responsible={null} coAuthors={[]} />,
    )

    expect(container.textContent).toBe('')
  })

  it('changes the Responsible, and takes the Responsible away', async () => {
    const onChange = vi.fn()
    render(
      <Assignees
        members={MEMBERS}
        responsible={1}
        coAuthors={[]}
        onChange={onChange}
      />,
    )
    const responsible = screen.getByRole('combobox', { name: 'Responsible' })

    expect((responsible as HTMLSelectElement).value).toBe('1')
    await userEvent.selectOptions(responsible, 'Bo')
    await userEvent.selectOptions(responsible, '')

    expect(onChange.mock.calls).toEqual([
      [{ memberId: 2, role: 'responsible' }],
      [{ memberId: 1, role: null }],
    ])
  })

  it('adds and removes a Co-Author. The Responsible is not in the list', async () => {
    const onChange = vi.fn()
    render(
      <Assignees
        members={MEMBERS}
        responsible={1}
        coAuthors={[2]}
        onChange={onChange}
      />,
    )

    const checked = (name: string) =>
      screen.getByRole<HTMLInputElement>('checkbox', { name }).checked
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect([checked('Bo'), checked('Cy')]).toEqual([true, false])

    await userEvent.click(screen.getByRole('checkbox', { name: 'Cy' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bo' }))

    expect(onChange.mock.calls).toEqual([
      [{ memberId: 3, role: 'co-author' }],
      [{ memberId: 2, role: null }],
    ])
  })

  it('is no wider than its place, so a narrow record page does not scroll sideways', () => {
    render(
      <Assignees
        members={MEMBERS}
        responsible={1}
        coAuthors={[]}
        onChange={() => {}}
      />,
    )
    const group = screen
      .getByRole('combobox', { name: 'Responsible' })
      .closest('body > div > *')

    expect(group && getComputedStyle(group).maxInlineSize).toBe('100%')
  })

  it('shows that a write runs on the line of the label, so it takes no room below', () => {
    render(
      <Assignees
        members={MEMBERS}
        responsible={1}
        coAuthors={[]}
        pending="Saving"
        onChange={() => {}}
      />,
    )
    const saving = screen.getByText('Saving').parentElement

    expect(saving && getComputedStyle(saving).position).toBe('absolute')
  })

  it('says why a write failed', () => {
    render(
      <Assignees
        members={MEMBERS}
        responsible={null}
        coAuthors={[]}
        onChange={() => {}}
        error="Only a member of the Project can change it."
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'Only a member of the Project can change it.',
    )
  })
})
