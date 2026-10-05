// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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

  it('stays open on Escape in an open popup: the key closes the popup', async () => {
    const onClose = vi.fn()
    render(
      <MapPanel name="Decision D12" href="/glue/D12" onClose={onClose}>
        <button type="button" aria-haspopup="listbox" aria-expanded>
          Home
        </button>
        <div role="dialog" aria-label="Sink">
          <button type="button">Cancel</button>
        </div>
      </MapPanel>,
    )

    screen.getByRole('button', { name: 'Home' }).focus()
    await userEvent.keyboard('{Escape}')
    screen.getByRole('button', { name: 'Cancel' }).focus()
    await userEvent.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('gives the focus back to what opened it, when it closes', async () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Merge gate
          </button>
          {open && (
            <MapPanel
              name="Merge gate"
              href="/glue/merge-gate"
              onClose={() => setOpen(false)}
            >
              <p>2 Parts</p>
            </MapPanel>
          )}
        </>
      )
    }
    render(<Opener />)

    await userEvent.click(screen.getByRole('button', { name: 'Merge gate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Merge gate' }),
    )
  })
})
