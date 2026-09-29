// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderInRouter } from '../../test/render.tsx'
import {
  ErrorState,
  LoadingState,
  MissingPageState,
  MissingRecordState,
} from './page-state.tsx'

describe('LoadingState', () => {
  it('tells a screen reader what loads', async () => {
    await renderInRouter(<LoadingState name="the Concept" />)

    expect(screen.getByRole('status').textContent).toBe('Loading the Concept')
  })
})

describe('ErrorState', () => {
  it('says what did not load and how to go on', async () => {
    await renderInRouter(<ErrorState name="the Concept" onRetry={vi.fn()} />)

    const alert = within(screen.getByRole('alert'))

    expect(alert.getByRole('heading', { level: 1 }).textContent).toBe(
      'Unable to load the Concept',
    )
    expect(
      alert.getByText('Check your connection, then try again.'),
    ).toBeDefined()
  })

  it('loads again on request', async () => {
    const onRetry = vi.fn()
    await renderInRouter(<ErrorState name="the Concept" onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })
})

function overviewPath() {
  return screen
    .getByRole('link', { name: 'Go to the Concept' })
    .getAttribute('href')
}

describe('MissingRecordState', () => {
  it('names the id that has no record and links to the overview', async () => {
    await renderInRouter(<MissingRecordState recordId="D99" />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No record D99',
    )
    expect(overviewPath()).toBe('/')
  })
})

describe('MissingPageState', () => {
  it('says that the address has no page and links to the overview', async () => {
    await renderInRouter(<MissingPageState />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No page at this address',
    )
    expect(overviewPath()).toBe('/')
  })
})
