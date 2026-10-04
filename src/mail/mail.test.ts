import { describe, expect, it, vi } from 'vitest'

import { findInboundAddress, sendMail } from './mail.ts'
import type { MailClient } from './mail.ts'

function createClient(send: MailClient['emails']['send']): MailClient {
  return {
    emails: {
      send,
      receiving: { get: () => Promise.reject(new Error('not used')) },
    },
    webhooks: {
      verify: () => {
        throw new Error('not used')
      },
    },
  }
}

describe('sendMail', () => {
  it('sends from the default address of the repo', async () => {
    const send = vi.fn<MailClient['emails']['send']>(() =>
      Promise.resolve({ data: { id: 'mail-1' }, error: null }),
    )

    await sendMail(createClient(send), {
      to: 'ada@example.com',
      subject: 'A Decision needs you',
      text: 'Open Glue.',
    })

    expect(send).toHaveBeenCalledWith({
      from: 'Glue <glue@apps.timschoch.com>',
      to: 'ada@example.com',
      subject: 'A Decision needs you',
      text: 'Open Glue.',
    })
  })

  it('throws when Resend refuses the mail', async () => {
    const client = createClient(() =>
      Promise.resolve({ data: null, error: { message: 'quota reached' } }),
    )

    await expect(
      sendMail(client, { to: 'ada@example.com', subject: 'Hi', text: 'Hi' }),
    ).rejects.toThrow('quota reached')
  })
})

describe('findInboundAddress', () => {
  it('finds the address of this repo in any letter case', () => {
    expect(findInboundAddress(['Glue@Apps.TimSchoch.com'])).toBe('default')
  })

  it('finds the address behind a display name', () => {
    expect(findInboundAddress(['Glue <glue@apps.timschoch.com>'])).toBe(
      'default',
    )
  })

  it('finds nothing in the mail of another repo', () => {
    expect(findInboundAddress(['skilly@apps.timschoch.com'])).toBeUndefined()
    expect(
      findInboundAddress(['notifications.glue@apps.timschoch.com']),
    ).toBeUndefined()
  })
})
