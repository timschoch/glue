// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { PartSearch } from './part-search.tsx'
import type { PartFormPart } from './part-search.tsx'

const PARTS: Array<PartFormPart> = [
  {
    id: 'G2',
    type: 'goal',
    title: 'First bake feels easy',
    trust: 'solid',
    href: '#G2',
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
]

afterEach(cleanup)

function renderSearch(invalidText?: string) {
  const onPick = vi.fn()
  render(
    <PartSearch
      id="search"
      label="Add Joint"
      parts={PARTS}
      invalidText={invalidText}
      onPick={onPick}
    />,
  )
  return onPick
}

const search = () => screen.getByRole('combobox', { name: 'Add Joint' })

const options = () =>
  screen.getAllByRole('option').map((option) => option.textContent)

describe('PartSearch', () => {
  it('offers each Part with its record id and its title', async () => {
    renderSearch()

    await userEvent.click(search())

    expect(options()).toEqual([
      'G2 First bake feels easy',
      'I7 Bakers want step videos',
      'I9 Videos are too long',
    ])
  })

  it.each([
    ['the record id', 'i9'],
    ['the title', 'too long'],
  ])('searches the Parts by %s', async (_, words) => {
    renderSearch()

    await userEvent.type(search(), words)

    expect(options()).toEqual(['I9 Videos are too long'])
  })

  it('gives the record id of a pick, and keeps no pick in the field', async () => {
    const onPick = renderSearch()

    await userEvent.type(search(), 'I7')
    await userEvent.click(
      screen.getByRole('option', { name: 'I7 Bakers want step videos' }),
    )

    expect(onPick).toHaveBeenCalledExactlyOnceWith('I7')
    expect(search()).toHaveProperty('value', '')
  })

  it('shows the reason of a wrong pick', () => {
    renderSearch('I3 is sunk')

    expect(screen.getByText('I3 is sunk')).toBeDefined()
  })

  it('shows no reason without one', () => {
    renderSearch()

    expect(search().getAttribute('aria-invalid')).not.toBe('true')
  })
})
