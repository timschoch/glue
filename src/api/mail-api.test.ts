import { describe, expect, it, vi } from 'vitest'

import type { InboundMail, MailClient } from '../mail/mail.ts'
import { handleInboundMail } from './mail-api.ts'

const WEBHOOK_SECRET = 'webhook-secret-for-tests'
const SIGNATURE = 'signature-for-tests'

const mail: InboundMail = {
  id: 'mail-1',
  from: 'ada@example.com',
  to: ['glue@apps.timschoch.com'],
  subject: 'Re: A Decision needs you',
  text: 'Accepted.',
  html: null,
}

function createEvent(to: string[], type = 'email.received') {
  return { type, data: { email_id: mail.id, to } }
}

// The fake verifies like Resend: a wrong signature or secret throws.
function createClient() {
  const get = vi.fn<MailClient['emails']['receiving']['get']>(() =>
    Promise.resolve({ data: mail, error: null }),
  )
  const client: MailClient = {
    emails: {
      send: () => Promise.reject(new Error('not used')),
      receiving: { get },
    },
    webhooks: {
      verify: ({ payload, headers, webhookSecret }) => {
        if (
          headers.signature !== SIGNATURE ||
          webhookSecret !== WEBHOOK_SECRET
        ) {
          throw new Error('wrong signature')
        }
        return JSON.parse(payload)
      },
    },
  }
  return { client, get }
}

async function callInbound(
  event: object,
  options: { signature?: string; webhookSecret?: string | undefined } = {},
) {
  const { client, get } = createClient()
  const onMail = vi.fn(() => Promise.resolve())
  const response = await handleInboundMail({
    request: new Request('http://localhost/api/mail/inbound', {
      method: 'POST',
      headers: {
        'svix-id': 'message-1',
        'svix-timestamp': '1790000000',
        'svix-signature': options.signature ?? SIGNATURE,
      },
      body: JSON.stringify(event),
    }),
    webhookSecret:
      'webhookSecret' in options ? options.webhookSecret : WEBHOOK_SECRET,
    client,
    onMail,
  })
  return { response, get, onMail }
}

describe('POST /api/mail/inbound', () => {
  it('answers 401 with a wrong signature', async () => {
    const { response, get, onMail } = await callInbound(createEvent(mail.to), {
      signature: 'wrong',
    })

    expect(response.status).toBe(401)
    expect(get).not.toHaveBeenCalled()
    expect(onMail).not.toHaveBeenCalled()
  })

  it('answers 401 when RESEND_WEBHOOK_SECRET is not set', async () => {
    const { response, onMail } = await callInbound(createEvent(mail.to), {
      webhookSecret: undefined,
    })

    expect(response.status).toBe(401)
    expect(onMail).not.toHaveBeenCalled()
  })

  it('answers 200 and ignores an event that is not a received mail', async () => {
    const { response, get, onMail } = await callInbound(
      createEvent(mail.to, 'email.delivered'),
    )

    expect(response.status).toBe(200)
    expect(get).not.toHaveBeenCalled()
    expect(onMail).not.toHaveBeenCalled()
  })

  it('answers 200 and ignores the mail of another repo', async () => {
    const { response, get, onMail } = await callInbound(
      createEvent(['skilly@apps.timschoch.com']),
    )

    expect(response.status).toBe(200)
    expect(get).not.toHaveBeenCalled()
    expect(onMail).not.toHaveBeenCalled()
  })

  it('hands the full mail to the app, with the name of its address', async () => {
    const { response, get, onMail } = await callInbound(createEvent(mail.to))

    expect(response.status).toBe(200)
    expect(get).toHaveBeenCalledWith(mail.id)
    expect(onMail).toHaveBeenCalledWith('default', mail)
  })
})
