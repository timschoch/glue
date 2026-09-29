import { NEON_AUTH_SESSION_COOKIE_NAME } from '@neondatabase/auth/server'

import type { SignIn, SignUp } from './credentials.ts'

type Answer<TValue> = Promise<{
  data: TValue | null
  error: { status: number; code?: string; message?: string } | null
}>

export type User = { id: string; name: string; email: string }

export type Session = { user: User }

export type Failure = { message: string }

// The part of the Neon Auth server that Glue uses.
export type AuthenticationServer = {
  getSession: () => Answer<{ session: object | null; user: User | null }>
  signIn: { email: (credentials: SignIn) => Answer<unknown> }
  signUp: { email: (account: SignUp) => Answer<unknown> }
  signOut: () => Answer<unknown>
}

export async function findSession(
  server: AuthenticationServer,
  cookies: string,
): Promise<Session | undefined> {
  // Without a session cookie there is no session. Do not ask Neon Auth.
  if (!cookies.includes(NEON_AUTH_SESSION_COOKIE_NAME)) return undefined

  const { data, error } = await server.getSession()
  if (error) throw new Error('Could not read the session.')
  if (!data?.session || !data.user) return undefined

  const { id, name, email } = data.user
  return { user: { id, name, email } }
}

function isUnavailable(error: { status: number }) {
  return error.status >= 500
}

export async function signIn(
  server: AuthenticationServer,
  credentials: SignIn,
): Promise<Failure | undefined> {
  const { error } = await server.signIn.email(credentials)
  if (!error) return undefined
  return {
    message: isUnavailable(error)
      ? 'Sign-in does not work at the moment. Try again later.'
      : 'The email or the password is wrong.',
  }
}

export async function signUp(
  server: AuthenticationServer,
  account: SignUp,
): Promise<Failure | undefined> {
  const { error } = await server.signUp.email(account)
  if (!error) return undefined
  return {
    message: isUnavailable(error)
      ? 'Sign-up does not work at the moment. Try again later.'
      : 'We could not make this account. Use a different email or sign in.',
  }
}

export async function signOut(server: AuthenticationServer): Promise<void> {
  await server.signOut()
}
