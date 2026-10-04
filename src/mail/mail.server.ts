import { Resend } from 'resend'

import { getSetting } from '../settings.server.ts'
import type { MailClient } from './mail.ts'

let client: MailClient | undefined

export function getMailClient(): MailClient {
  client ??= new Resend(getSetting('RESEND_API_KEY'))
  return client
}
