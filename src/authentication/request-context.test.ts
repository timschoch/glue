import { describe, expect, it } from 'vitest'

import { toRequestContext } from './request-context.ts'

function request(headers: Record<string, string> = {}) {
  return new Request('https://glue.example/concept/D5', { headers })
}

describe('toRequestContext', () => {
  it('passes on only the Neon Auth cookies of the request', async () => {
    const context = toRequestContext(
      request({
        cookie:
          'theme=dark; __Secure-neon-auth.session_token=abc; other=1; __Secure-neon-auth.local.session_data=xyz',
      }),
      () => {},
    )

    expect(await context.getCookies()).toBe(
      '__Secure-neon-auth.session_token=abc; __Secure-neon-auth.local.session_data=xyz',
    )
  })

  it('returns no cookies for a request without cookies', async () => {
    const context = toRequestContext(request(), () => {})

    expect(await context.getCookies()).toBe('')
  })

  it('reads a header by name, in any letter case', async () => {
    const context = toRequestContext(
      request({ 'User-Agent': 'vitest' }),
      () => {},
    )

    expect(await context.getHeader('user-agent')).toBe('vitest')
    expect(await context.getHeader('x-missing')).toBeNull()
  })

  it('takes the origin from the Origin header', async () => {
    const context = toRequestContext(
      request({ origin: 'https://app.example' }),
      () => {},
    )

    expect(await context.getOrigin()).toBe('https://app.example')
  })

  it('takes the origin from the request URL when there is no Origin header', async () => {
    const context = toRequestContext(request(), () => {})

    expect(await context.getOrigin()).toBe('https://glue.example')
  })
})
