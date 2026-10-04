// Resend calls this route for every mail that arrives on the shared domain,
// also for the mail of other repos. See resend.json for the webhook.
import { z } from 'zod'

import { findInboundAddress } from '../mail/mail.ts'
import type { InboundMail, MailClient } from '../mail/mail.ts'

// The event holds only metadata. The body comes from a second call.
const receivedMail = z.object({
  type: z.literal('email.received'),
  data: z.object({
    email_id: z.string(),
    to: z.array(z.string()),
    received_for: z.array(z.string()).default([]),
  }),
})

// Resend sends an ignored event again unless the answer is 200.
function ignore() {
  return new Response(null, { status: 200 })
}

// Without a secret no request passes.
function findSignedEvent(
  request: Request,
  payload: string,
  webhookSecret: string | undefined,
  client: MailClient,
) {
  if (!webhookSecret) return undefined
  try {
    return client.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret,
    })
  } catch {
    return undefined
  }
}

// `onMail` gets the name of the address in resend.json and the full mail.
export async function handleInboundMail(input: {
  request: Request
  webhookSecret: string | undefined
  client: MailClient
  onMail: (address: string, mail: InboundMail) => Promise<void>
}) {
  const { request, webhookSecret, client, onMail } = input
  // The signature covers the raw body, so do not parse it first.
  const payload = await request.text()
  const event = findSignedEvent(request, payload, webhookSecret, client)
  if (!event) {
    return Response.json(
      { error: { code: 'unauthorized', message: 'sign the webhook' } },
      { status: 401 },
    )
  }

  const received = receivedMail.safeParse(event)
  if (!received.success) return ignore()
  const { email_id: id, to, received_for: receivedFor } = received.data.data
  const address = findInboundAddress([...to, ...receivedFor])
  if (!address) return ignore()

  const { data: mail, error } = await client.emails.receiving.get(id)
  if (!mail) {
    throw new Error(`Could not fetch the mail ${id}: ${error?.message}`)
  }
  await onMail(address, mail)
  return new Response(null, { status: 200 })
}
