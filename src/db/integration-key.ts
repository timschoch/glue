// The key of a tool as Glue stores it (glue/D71): encrypted with
// AES-256-GCM. The secret of the server opens it, so a copy of the database
// alone gives no key.
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const CIPHER_KEY_BYTES = 32
// The length that GCM is built for.
const NONCE_BYTES = 12
// The first part of each stored key. A new way to encrypt takes a new one.
const FORMAT = 'v1'
const ENCODING = 'base64url'

function toCipherKey(secret: string) {
  return Buffer.from(
    hkdfSync('sha256', secret, '', 'glue integration key', CIPHER_KEY_BYTES),
  )
}

// Each call gives another text for the same key: the nonce is random.
export function encryptKey(secret: string, key: string): string {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGORITHM, toCipherKey(secret), nonce)
  const sealed = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  const parts = [nonce, cipher.getAuthTag(), sealed]
  return [FORMAT, ...parts.map((part) => part.toString(ENCODING))].join('.')
}

// Throws for a text that another secret made, or that was changed.
export function decryptKey(secret: string, encrypted: string): string {
  const [format, ...parts] = encrypted.split('.')
  if (format !== FORMAT) throw new Error('The stored key has an unknown form.')
  const [nonce, tag, sealed] = parts.map((part) => Buffer.from(part, ENCODING))
  const decipher = createDecipheriv(ALGORITHM, toCipherKey(secret), nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(sealed), decipher.final()]).toString(
    'utf8',
  )
}
