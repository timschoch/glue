// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderInRouter } from '../../test/render.tsx'
import { PageFrame } from './page-frame.tsx'

const user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' }

function renderFrame(onSignOut = vi.fn(() => Promise.resolve())) {
  return renderInRouter(
    <PageFrame user={user} onSignOut={onSignOut}>
      <h1>The page</h1>
    </PageFrame>,
  )
}

describe('PageFrame', () => {
  it('puts the page in the one main area', async () => {
    await renderFrame()

    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1 })
        .textContent,
    ).toBe('The page')
  })

  it('starts with a link that skips to the content', async () => {
    await renderFrame()

    const [first] = screen.getAllByRole('link')

    expect(first.textContent).toBe('Skip to the content')
    expect(first.getAttribute('href')).toBe('#content')
    expect(screen.getByRole('main').id).toBe('content')
  })

  it('links the name of the app to the overview', async () => {
    await renderFrame()

    expect(
      within(screen.getByRole('banner'))
        .getByRole('link', { name: 'Glue' })
        .getAttribute('href'),
    ).toBe('/')
  })

  it('shows who is signed in', async () => {
    await renderFrame()

    expect(within(screen.getByRole('banner')).getByText('Ada')).toBeDefined()
  })

  it('signs out on request, and does not take a second request while it does', async () => {
    let finish = () => {}
    const onSignOut = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    await renderFrame(onSignOut)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await userEvent.click(screen.getByRole('button', { name: 'Signing out' }))

    expect(onSignOut).toHaveBeenCalledOnce()

    finish()

    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeDefined()
  })

  it('says when sign-out did not work', async () => {
    await renderFrame(vi.fn(() => Promise.reject(new Error('offline'))))

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sign-out did not work. Try again.',
    )
  })
})
