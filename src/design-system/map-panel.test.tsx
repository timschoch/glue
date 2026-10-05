// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapPanel } from './map-panel.tsx'

afterEach(cleanup)

function renderPanel(onClose = vi.fn()) {
  render(
    <MapPanel name="Decision D12" href="/glue/part-model/D12" onClose={onClose}>
      <p>Show the video of the creator</p>
    </MapPanel>,
  )
  return onClose
}

describe('MapPanel', () => {
  it('shows its content with a link to the full page', () => {
    renderPanel()

    const panel = screen.getByRole('complementary', { name: 'Decision D12' })

    within(panel).getByText('Show the video of the creator')
    expect(
      within(panel).getByRole('link', { name: 'Open' }).getAttribute('href'),
    ).toBe('/glue/part-model/D12')
  })

  it('closes with its close button', async () => {
    const onClose = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes with Escape', async () => {
    const onClose = renderPanel()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stays open on another key', async () => {
    const onClose = renderPanel()

    await userEvent.keyboard('{Enter}')

    expect(onClose).not.toHaveBeenCalled()
  })
})
