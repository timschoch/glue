// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Failure } from '../../authentication/session.ts'
import { renderInRouter } from '../../test/render.tsx'
import { SignInForm, SignUpForm } from './credentials-form.tsx'

const done = () => Promise.resolve<Failure | undefined>(undefined)

function field(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label)
}

// The text that the field points at with aria-describedby.
function description(input: HTMLElement) {
  return (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ')
}

async function fillSignIn() {
  await userEvent.type(field('Email'), 'ada@example.com')
  await userEvent.type(field('Password'), 'correct horse')
}

describe('SignInForm', () => {
  it('labels each field and lets a password manager fill it', async () => {
    await renderInRouter(
      <SignInForm signIn={vi.fn(done)} onSignedIn={vi.fn()} />,
    )

    expect(field('Email').type).toBe('email')
    expect(field('Email').autocomplete).toBe('email')
    expect(field('Password').autocomplete).toBe('current-password')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('keeps the password out of the address when the page is not ready', async () => {
    await renderInRouter(
      <SignInForm signIn={vi.fn(done)} onSignedIn={vi.fn()} />,
    )

    // Without JavaScript the browser sends the form itself. GET puts each
    // field in the address.
    expect(field('Password').form?.method).toBe('post')
  })

  it('signs in with the email and the password, then goes on', async () => {
    const signIn = vi.fn(done)
    const onSignedIn = vi.fn()
    await renderInRouter(<SignInForm signIn={signIn} onSignedIn={onSignedIn} />)

    await fillSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(signIn).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct horse',
    })
    expect(onSignedIn).toHaveBeenCalledOnce()
  })

  it('signs in with the Enter key', async () => {
    const signIn = vi.fn(done)
    await renderInRouter(<SignInForm signIn={signIn} onSignedIn={vi.fn()} />)

    await fillSignIn()
    await userEvent.keyboard('{Enter}')

    expect(signIn).toHaveBeenCalledOnce()
  })

  it('shows why sign-in failed, keeps the email and does not go on', async () => {
    const signIn = vi.fn(() =>
      Promise.resolve({ message: 'The email or the password is wrong.' }),
    )
    const onSignedIn = vi.fn()
    await renderInRouter(<SignInForm signIn={signIn} onSignedIn={onSignedIn} />)

    await fillSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The email or the password is wrong.',
    )
    expect(field('Email').value).toBe('ada@example.com')
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('says when the request did not reach the server', async () => {
    const signIn = vi.fn(() => Promise.reject(new Error('offline')))
    await renderInRouter(<SignInForm signIn={signIn} onSignedIn={vi.fn()} />)

    await fillSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sign-in does not work at the moment. Check your connection, then try again.',
    )
  })

  it('checks the fields on submit, marks each bad field and goes to the first', async () => {
    const signIn = vi.fn(done)
    await renderInRouter(<SignInForm signIn={signIn} onSignedIn={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(signIn).not.toHaveBeenCalled()
    expect(field('Email').getAttribute('aria-invalid')).toBe('true')
    expect(description(field('Email'))).toContain(
      'Enter an email address, such as ada@example.com.',
    )
    expect(field('Password').getAttribute('aria-invalid')).toBe('true')
    expect(description(field('Password'))).toContain('Enter a password.')
    expect(document.activeElement).toBe(field('Email'))
  })

  it('removes the problem of a field that is right on the next submit', async () => {
    await renderInRouter(
      <SignInForm signIn={vi.fn(done)} onSignedIn={vi.fn()} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await userEvent.type(field('Email'), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(field('Email').getAttribute('aria-invalid')).not.toBe('true')
    expect(document.activeElement).toBe(field('Password'))
  })

  it('does not take a second request while it signs in', async () => {
    let finish = (_failure: undefined) => {}
    const signIn = vi.fn(
      () => new Promise<undefined>((resolve) => (finish = resolve)),
    )
    await renderInRouter(<SignInForm signIn={signIn} onSignedIn={vi.fn()} />)

    await fillSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await userEvent.click(screen.getByRole('button', { name: 'Signing in' }))

    expect(signIn).toHaveBeenCalledOnce()

    finish(undefined)
  })

  it('links to sign-up and keeps the page to show after it', async () => {
    await renderInRouter(
      <SignInForm
        signIn={vi.fn(done)}
        onSignedIn={vi.fn()}
        redirect="/concept/D5"
      />,
    )

    expect(
      screen
        .getByRole('link', { name: 'Make an account' })
        .getAttribute('href'),
    ).toBe('/sign-up?redirect=%2Fconcept%2FD5')
  })
})

describe('SignUpForm', () => {
  it('labels each field and lets a password manager make a password', async () => {
    await renderInRouter(
      <SignUpForm signUp={vi.fn(done)} onSignedIn={vi.fn()} />,
    )

    expect(field('Name').autocomplete).toBe('name')
    expect(field('Email').autocomplete).toBe('email')
    expect(field('Password').autocomplete).toBe('new-password')
    expect(description(field('Password'))).toContain('8 characters or more')
  })

  it('makes the account with the name, the email and the password, then goes on', async () => {
    const signUp = vi.fn(done)
    const onSignedIn = vi.fn()
    await renderInRouter(<SignUpForm signUp={signUp} onSignedIn={onSignedIn} />)

    await userEvent.type(field('Name'), 'Ada')
    await userEvent.type(field('Email'), 'ada@example.com')
    await userEvent.type(field('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Make account' }))

    expect(signUp).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct horse',
    })
    expect(onSignedIn).toHaveBeenCalledOnce()
  })

  it('does not take a password shorter than 8 characters', async () => {
    const signUp = vi.fn(done)
    await renderInRouter(<SignUpForm signUp={signUp} onSignedIn={vi.fn()} />)

    await userEvent.type(field('Name'), 'Ada')
    await userEvent.type(field('Email'), 'ada@example.com')
    await userEvent.type(field('Password'), 'short12')
    await userEvent.click(screen.getByRole('button', { name: 'Make account' }))

    expect(signUp).not.toHaveBeenCalled()
    expect(description(field('Password'))).toContain(
      'The password must have 8 characters or more.',
    )
    expect(document.activeElement).toBe(field('Password'))
  })

  it('links to sign-in and keeps the page to show after it', async () => {
    await renderInRouter(
      <SignUpForm
        signUp={vi.fn(done)}
        onSignedIn={vi.fn()}
        redirect="/concept/D5"
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
    ).toBe('/sign-in?redirect=%2Fconcept%2FD5')
  })
})
