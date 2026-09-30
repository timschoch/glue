// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Failure } from '../../authentication/session.ts'
import { renderInRouter } from '../../test/render.tsx'
import { InsightTriage } from './insight-triage.tsx'

const insight = { id: 'I3', title: 'The build failed on a type error' }

type Write = () => Promise<Failure | undefined>

function renderTriage({
  onKeep = () => Promise.resolve(undefined),
  onDiscard = () => Promise.resolve(undefined),
}: { onKeep?: Write; onDiscard?: Write } = {}) {
  return renderInRouter(
    <InsightTriage insight={insight} onKeep={onKeep} onDiscard={onDiscard} />,
  )
}

function button(name: string) {
  return screen.getByRole<HTMLButtonElement>('button', { name })
}

describe('InsightTriage', () => {
  it('keeps the draft, and takes no second request while it does', async () => {
    let finish = () => {}
    const onKeep = vi.fn(
      () =>
        new Promise<undefined>(
          (resolve) => (finish = () => resolve(undefined)),
        ),
    )
    await renderTriage({ onKeep })

    await userEvent.click(button('Keep I3'))

    expect(button('Keeping I3').disabled).toBe(true)
    expect(button('Discard I3').disabled).toBe(true)
    expect(onKeep).toHaveBeenCalledOnce()

    finish()

    expect(await screen.findByRole('button', { name: 'Keep I3' })).toBeDefined()
  })

  it('asks a second time before it discards the draft', async () => {
    const onDiscard = vi.fn(() => Promise.resolve(undefined))
    await renderTriage({ onDiscard })

    await userEvent.click(button('Discard I3'))

    expect(
      screen.getByText('You cannot get a discarded Insight back.'),
    ).toBeDefined()
    expect(onDiscard).not.toHaveBeenCalled()

    await userEvent.click(button('Discard I3 for good'))

    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('moves the focus with the question and back', async () => {
    await renderTriage()

    await userEvent.click(button('Discard I3'))
    expect(document.activeElement).toBe(button('Do not discard I3'))

    await userEvent.click(button('Do not discard I3'))
    expect(document.activeElement).toBe(button('Discard I3'))
  })

  it('does not discard the draft when the person says no', async () => {
    const onDiscard = vi.fn(() => Promise.resolve(undefined))
    await renderTriage({ onDiscard })

    await userEvent.click(button('Discard I3'))
    await userEvent.click(button('Do not discard I3'))

    expect(button('Keep I3')).toBeDefined()
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('says why the draft was not discarded', async () => {
    await renderTriage({
      onDiscard: () =>
        Promise.resolve({ message: '"I3" is the evidence of D2' }),
    })

    await userEvent.click(button('Discard I3'))
    await userEvent.click(button('Discard I3 for good'))

    expect((await screen.findByRole('alert')).textContent).toBe(
      '"I3" is the evidence of D2',
    )
  })

  it('says when the request did not reach the server', async () => {
    await renderTriage({ onKeep: () => Promise.reject(new Error('offline')) })

    await userEvent.click(button('Keep I3'))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'This did not work. Check your connection, then try again.',
    )
  })

  it('links to the Decision form with the draft as evidence', async () => {
    await renderTriage()

    expect(
      screen
        .getByRole('link', { name: 'Propose a Decision from I3' })
        .getAttribute('href'),
    ).toBe('/glue/decisions/new?evidence=I3')
  })
})
