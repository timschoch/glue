import { createServerFn } from '@tanstack/react-start'

import { parseSignIn, parseSignUp } from './credentials.ts'
import {
  getAuthenticationServer,
  getRequestCookies,
} from './neon-auth.server.ts'
import { findSession, signIn, signOut, signUp } from './session.ts'

export const fetchSession = createServerFn({ method: 'GET' }).handler(() =>
  findSession(getAuthenticationServer(), getRequestCookies()),
)

export const submitSignIn = createServerFn({ method: 'POST' })
  .validator(parseSignIn)
  .handler(({ data }) => signIn(getAuthenticationServer(), data))

export const submitSignUp = createServerFn({ method: 'POST' })
  .validator(parseSignUp)
  .handler(({ data }) => signUp(getAuthenticationServer(), data))

export const submitSignOut = createServerFn({ method: 'POST' }).handler(() =>
  signOut(getAuthenticationServer()),
)
