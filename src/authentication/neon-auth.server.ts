import { createAuthServer } from '@neondatabase/auth/server'
import { getRequest, setCookie } from '@tanstack/react-start/server'

import { getSetting } from '../settings.server.ts'
import { toRequestContext } from './request-context.ts'
import type { AuthenticationServer } from './session.ts'

let server: AuthenticationServer | undefined

export function getAuthenticationServer(): AuthenticationServer {
  server ??= createAuthServer({
    baseUrl: getSetting('NEON_AUTH_BASE_URL'),
    cookieSecret: getSetting('NEON_AUTH_COOKIE_SECRET'),
    context: () => toRequestContext(getRequest(), setCookie),
  })
  return server
}

export function getRequestCookies(): string {
  return getRequest().headers.get('cookie') ?? ''
}
