// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import './theme.scss'
import { CredentialsForm } from './credentials-form.tsx'
import type { CredentialsFormProps } from './credentials-form.tsx'

const SIGN_IN: Omit<CredentialsFormProps, 'onSubmit'> = {
  title: 'Sign in to Glue',
  action: 'Sign in',
  pendingAction: 'Signing in',
  passwordAutoComplete: 'current-password',
  other: { name: 'Make an account', href: '/sign-up' },
}

const SIGN_UP: Omit<CredentialsFormProps, 'onSubmit'> = {
  title: 'Make an account',
  action: 'Make account',
  pendingAction: 'Making the account',
  withName: true,
  passwordAutoComplete: 'new-password',
  passwordPlaceholder: '8 characters or more',
  other: { name: 'Sign in', href: '/sign-in' },
}

afterEach(cleanup)

function form(props: Partial<CredentialsFormProps> = {}, onSubmit = vi.fn()) {
  return <CredentialsForm {...SIGN_IN} onSubmit={onSubmit} {...props} />
}

function renderForm(props: Partial<CredentialsFormProps> = {}) {
  const onSubmit = vi.fn()
  const { rerender } = render(form(props, onSubmit))
  return {
    onSubmit,
    rerender: (next: Partial<CredentialsFormProps>) =>
      rerender(form({ ...props, ...next }, onSubmit)),
  }
}

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

// The texts of the alerts. Each Carbon field holds an empty one for its
// counter.
function alerts(): Array<string> {
  return screen
    .queryAllByRole('alert')
    .map((alert) => alert.textContent)
    .filter((text) => text !== '')
}

async function fillSignIn() {
  await userEvent.type(field('Email'), 'ada@example.com')
  await userEvent.type(field('Password'), 'correct horse')
}

describe('CredentialsForm', () => {
  it('names the page as the page title', () => {
    renderForm()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Sign in to Glue',
    )
    screen.getByRole('form', { name: 'Sign in to Glue' })
  })

  it('labels each field and lets a password manager fill it', () => {
    renderForm()

    expect(field('Email').type).toBe('email')
    expect(field('Email').autocomplete).toBe('email')
    expect(field('Email').getAttribute('autocapitalize')).toBe('none')
    expect(field('Email').getAttribute('spellcheck')).toBe('false')
    expect(field('Password').type).toBe('password')
    expect(field('Password').autocomplete).toBe('current-password')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('has a field for the name on sign-up, and lets a password manager make a password', () => {
    renderForm(SIGN_UP)

    expect(field('Name').autocomplete).toBe('name')
    expect(field('Password').autocomplete).toBe('new-password')
  })

  it('shows the format of the password as its placeholder, and no helper text', () => {
    renderForm(SIGN_UP)

    expect(field('Password').placeholder).toBe('8 characters or more')
    expect(document.querySelector('[class*="helper-text"]')).toBeNull()
  })

  it('keeps the password out of the address when the page is not ready', () => {
    renderForm()

    // Without JavaScript the browser sends the form itself. GET puts each
    // field in the address.
    expect(field('Password').form?.method).toBe('post')
    expect(field('Password').form?.noValidate).toBe(true)
  })

  it('submits the email and the password with its one primary button', async () => {
    const { onSubmit } = renderForm()

    await fillSignIn()

    const submit = screen.getByRole('button', { name: 'Sign in' })

    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.className.includes('btn--primary')),
    ).toEqual([submit])

    await userEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      name: '',
      email: 'ada@example.com',
      password: 'correct horse',
    })
  })

  it('submits the name too on sign-up', async () => {
    const { onSubmit } = renderForm(SIGN_UP)

    await userEvent.type(field('Name'), 'Ada')
    await fillSignIn()
    await userEvent.click(screen.getByRole('button', { name: 'Make account' }))

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct horse',
    })
  })

  it('submits with the Enter key', async () => {
    const { onSubmit } = renderForm()

    await fillSignIn()
    await userEvent.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('submits empty fields too: the caller checks them', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      name: '',
      email: '',
      password: '',
    })
  })

  it('marks each wrong field with its reason and goes to the first', () => {
    const { rerender } = renderForm()

    rerender({
      problems: {
        email: 'Enter an email address, such as ada@example.com.',
        password: 'Enter a password.',
      },
    })

    expect(field('Email').getAttribute('aria-invalid')).toBe('true')
    expect(description(field('Email'))).toBe(
      'Enter an email address, such as ada@example.com.',
    )
    expect(field('Password').getAttribute('aria-invalid')).toBe('true')
    expect(description(field('Password'))).toBe('Enter a password.')
    expect(document.activeElement).toBe(field('Email'))
  })

  it('goes to the name first on sign-up', () => {
    renderForm({
      ...SIGN_UP,
      problems: { password: 'Enter a password.', name: 'Enter your name.' },
    })

    expect(document.activeElement).toBe(field('Name'))
  })

  it('removes the problem of a field that is right, and goes to the next wrong field', async () => {
    const { rerender } = renderForm({
      problems: { email: 'Enter an email address.', password: 'Enter one.' },
    })

    await userEvent.type(field('Email'), 'ada@example.com')
    rerender({ problems: { password: 'Enter one.' } })

    expect(field('Email').getAttribute('aria-invalid')).not.toBe('true')
    expect(field('Email').hasAttribute('aria-describedby')).toBe(false)
    expect(field('Email').value).toBe('ada@example.com')
    expect(document.activeElement).toBe(field('Password'))
  })

  it('keeps the focus where it is while no field is wrong', async () => {
    const { rerender } = renderForm()

    await userEvent.click(field('Password'))
    rerender({ problems: {} })

    expect(document.activeElement).toBe(field('Password'))
  })

  it('shows why it failed as one alert, and keeps the email', async () => {
    const { rerender } = renderForm()

    await fillSignIn()
    rerender({ failure: 'The email or the password is wrong.' })

    // Carbon names its icon in the alert.
    expect(alerts()).toEqual(['error iconThe email or the password is wrong.'])
    expect(field('Email').value).toBe('ada@example.com')
  })

  it('shows no alert without a failure', () => {
    renderForm()

    expect(alerts()).toEqual([])
  })

  it('shows the words of the action in the place of the button while it is pending, and takes no second submit', async () => {
    const { onSubmit } = renderForm({ pending: true })

    screen.getByText('Signing in')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()

    await fillSignIn()
    await userEvent.keyboard('{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('links to the other page with the link alone', async () => {
    // The caller opens the page itself. jsdom can not go to another page.
    const onOpen = vi.fn<NonNullable<CredentialsFormProps['onOpen']>>(
      (_href, event) => event.preventDefault(),
    )
    renderForm({ onOpen })

    const link = screen.getByRole('link', { name: 'Make an account' })

    expect(link.getAttribute('href')).toBe('/sign-up')
    expect(link.parentElement?.textContent).not.toContain('?')

    await userEvent.click(link)

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(
      '/sign-up',
      expect.anything(),
    )
  })
})
