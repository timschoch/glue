import { extractNeonAuthCookies } from '@neondatabase/auth/server'
import type { RequestContext } from '@neondatabase/auth/server'

// The bridge from one request to the Neon Auth toolkit.
export function toRequestContext(
  request: Request,
  setCookie: RequestContext['setCookie'],
): RequestContext {
  return {
    getCookies: () => extractNeonAuthCookies(request.headers),
    setCookie,
    getHeader: (name) => request.headers.get(name),
    // A page load has no Origin header, the request URL has the same origin.
    getOrigin: () =>
      request.headers.get('origin') ?? new URL(request.url).origin,
    getFramework: () => 'tanstack-start',
  }
}
