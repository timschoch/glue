// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { SignalFilterForm } from './signal-filter-form.tsx'

afterEach(cleanup)

const SLOW_LISTS = {
  name: 'Slow lists',
  mustHold: ['slow', 'list'],
  mustNotHold: ['phone'],
  sources: ['github', 'social'],
}

function renderForm(
  props: Partial<Parameters<typeof SignalFilterForm>[0]> = {},
) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<SignalFilterForm onSave={onSave} onCancel={onCancel} {...props} />)
  return { onSave, onCancel }
}

const field = (name: string) =>
  screen.getByRole<HTMLInputElement>('textbox', { name })

const source = (name: string) =>
  screen.getByRole<HTMLInputElement>('checkbox', { name })

const save = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save' })

describe('SignalFilterForm', () => {
  it('saves the name, the words and the sources of a new filter', async () => {
    const { onSave } = renderForm()

    await userEvent.type(field('Name'), ' Slow lists ')
    await userEvent.type(field('Must hold'), 'slow, list')
    await userEvent.type(field('Must not hold'), 'phone')
    await userEvent.click(source('GitHub'))
    await userEvent.click(source('Social'))
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalledWith(SLOW_LISTS)
  })

  it('offers the five sources', () => {
    renderForm()

    expect(
      screen
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.getAttribute('value')),
    ).toEqual(['github', 'support', 'analytics', 'social', 'market'])
  })

  it('starts with the values of the filter that it changes', () => {
    renderForm({ filter: SLOW_LISTS })

    expect(field('Name').value).toBe('Slow lists')
    expect(field('Must hold').value).toBe('slow list')
    expect(field('Must not hold').value).toBe('phone')
    expect(source('GitHub').checked).toBe(true)
    expect(source('Support').checked).toBe(false)
    expect(source('Social').checked).toBe(true)
  })

  it('saves no filter without a name, or with no word and no source', async () => {
    renderForm()

    await userEvent.type(field('Name'), 'Slow lists')

    expect(save().disabled).toBe(true)

    await userEvent.click(source('Market'))

    expect(save().disabled).toBe(false)

    await userEvent.clear(field('Name'))

    expect(save().disabled).toBe(true)
  })

  it('shows at the name why the name is wrong', () => {
    renderForm({ error: 'A filter has this name already.' })

    expect(field('Name').getAttribute('aria-invalid')).toBe('true')
    screen.getByText('A filter has this name already.')
  })

  it('deletes the filter that it changes', async () => {
    const onDelete = vi.fn()
    renderForm({ filter: SLOW_LISTS, onDelete })

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('has no delete for a new filter', () => {
    renderForm()

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it.each(['Saving', 'Deleting'] as const)(
    'shows that it is %s, and takes no second write',
    (pending) => {
      const onDelete = vi.fn()
      renderForm({ filter: SLOW_LISTS, onDelete, pending })

      screen.getByText(pending)
      expect(
        screen
          .queryAllByRole('button', { name: /Save|Delete/ })
          .every((button) => (button as HTMLButtonElement).disabled),
      ).toBe(true)
    },
  )

  it('shows why the server did not save', () => {
    renderForm({ serverError: 'Only a member of the Project can change it.' })

    screen.getByText('Only a member of the Project can change it.')
  })
})
