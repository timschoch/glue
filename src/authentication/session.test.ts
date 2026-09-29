import { describe, expect, it, vi } from 'vitest'

import { findSession, signIn, signOut, signUp } from './session.ts'
import type { AuthenticationServer } from './session.ts'

const sessionCookie = '__Secure-neon-auth.session_token=abc'

const user = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  emailVerified: false,
}

function server(
  overrides: Partial<AuthenticationServer> = {},
): AuthenticationServer {
  const done = () => Promise.resolve({ data: {}, error: null })
  return {
    getSession: () =>
      Promise.resolve({
        data: { session: { token: 'secret-token' }, user },
        error: null,
      }),
    signIn: { email: done },
    signUp: { email: done },
    signOut: done,
    ...overrides,
  }
}

function failed(status: number, code: string) {
  return () =>
    Promise.resolve({
      data: null,
      error: { status, code, message: `upstream says ${code}` },
    })
}

describe('findSession', () => {
  it('returns the user of the session, without the session token', async () => {
    expect(await findSession(server(), sessionCookie)).toEqual({
      user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' },
    })
  })

  it('returns nothing and asks nobody when the request has no session cookie', async () => {
    const getSession = vi.fn()

    expect(
      await findSession(server({ getSession }), 'theme=dark'),
    ).toBeUndefined()
    expect(getSession).not.toHaveBeenCalled()
  })

  it('returns nothing when the session is not valid any more', async () => {
    const getSession = () =>
      Promise.resolve({ data: { session: null, user: null }, error: null })

    expect(
      await findSession(server({ getSession }), sessionCookie),
    ).toBeUndefined()
  })

  it('returns nothing when the answer is empty', async () => {
    const getSession = () => Promise.resolve({ data: null, error: null })

    expect(
      await findSession(server({ getSession }), sessionCookie),
    ).toBeUndefined()
  })

  it('throws when Neon Auth does not answer, so nobody looks signed out by accident', async () => {
    const getSession = failed(502, 'NETWORK_TIMEOUT')

    await expect(
      findSession(server({ getSession }), sessionCookie),
    ).rejects.toThrow('Could not read the session.')
  })
})

describe('signIn', () => {
  const credentials = { email: 'ada@example.com', password: 'correct horse' }

  it('gives the credentials to Neon Auth and returns no failure', async () => {
    const email = vi.fn(() => Promise.resolve({ data: {}, error: null }))

    expect(
      await signIn(server({ signIn: { email } }), credentials),
    ).toBeUndefined()
    expect(email).toHaveBeenCalledWith(credentials)
  })

  it('does not tell which of email and password is wrong', async () => {
    const email = failed(401, 'INVALID_EMAIL_OR_PASSWORD')

    expect(await signIn(server({ signIn: { email } }), credentials)).toEqual({
      message: 'The email or the password is wrong.',
    })
  })

  it('tells when Neon Auth does not answer', async () => {
    const email = failed(502, 'NETWORK_TIMEOUT')

    expect(await signIn(server({ signIn: { email } }), credentials)).toEqual({
      message: 'Sign-in does not work at the moment. Try again later.',
    })
  })
})

describe('signUp', () => {
  const account = {
    name: 'Ada',
    email: 'ada@example.com',
    password: 'correct horse',
  }

  it('gives the account to Neon Auth and returns no failure', async () => {
    const email = vi.fn(() => Promise.resolve({ data: {}, error: null }))

    expect(await signUp(server({ signUp: { email } }), account)).toBeUndefined()
    expect(email).toHaveBeenCalledWith(account)
  })

  it('does not tell that an email has an account already', async () => {
    const email = failed(422, 'USER_ALREADY_EXISTS')

    expect(await signUp(server({ signUp: { email } }), account)).toEqual({
      message:
        'We could not make this account. Use a different email or sign in.',
    })
  })

  it('tells when Neon Auth does not answer', async () => {
    const email = failed(502, 'NETWORK_TIMEOUT')

    expect(await signUp(server({ signUp: { email } }), account)).toEqual({
      message: 'Sign-up does not work at the moment. Try again later.',
    })
  })
})

describe('signOut', () => {
  it('ends the session at Neon Auth', async () => {
    const end = vi.fn(() => Promise.resolve({ data: {}, error: null }))

    await signOut(server({ signOut: end }))

    expect(end).toHaveBeenCalledOnce()
  })
})
