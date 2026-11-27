import { describe, expect, it } from 'vitest'
import { decryptKey, encryptKey } from './integration-key'

const SECRET = 'the secret of the server'

describe('a stored key', () => {
  it('opens with the secret that sealed it', () => {
    expect(decryptKey(SECRET, encryptKey(SECRET, 'sk-123'))).toBe('sk-123')
  })

  it('does not open with another secret', () => {
    expect(() =>
      decryptKey('another secret', encryptKey(SECRET, 'sk-123')),
    ).toThrow()
  })

  // A short tag is easier to forge: GCM must check all 16 bytes.
  it('does not open when its tag was cut short', () => {
    const [format, nonce, tag, sealed] = encryptKey(SECRET, 'sk-123').split('.')
    const shortTag = Buffer.from(tag, 'base64url')
      .subarray(0, 4)
      .toString('base64url')
    expect(() =>
      decryptKey(SECRET, [format, nonce, shortTag, sealed].join('.')),
    ).toThrow()
  })
})
