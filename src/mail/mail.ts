// The addresses of Glue live in resend.json. Send every mail through sendMail.
import setup from '../../resend.json' with { type: 'json' }

type Answer<TValue> = Promise<{
  data: TValue | null
  error: { message: string } | null
}>

export type Mail = {
  // The name of an address in resend.json.
  from?: string
  to: string | string[]
  subject: string
  text: string
  html?: string
}

export type InboundMail = {
  id: string
  from: string
  to: string[]
  subject: string
  text: string | null
  html: string | null
}

// The part of the Resend client that Glue uses.
export type MailClient = {
  emails: {
    send: (mail: Mail & { from: string }) => Answer<{ id: string }>
    receiving: { get: (id: string) => Answer<InboundMail> }
  }
  webhooks: {
    verify: (input: {
      payload: string
      headers: { id: string; timestamp: string; signature: string }
      webhookSecret: string
    }) => unknown
  }
}

const BRACKETED = /<([^>]+)>/

function toAddress(recipient: string) {
  return (recipient.match(BRACKETED)?.[1] ?? recipient).trim().toLowerCase()
}

export async function sendMail(
  client: MailClient,
  { from = 'default', ...mail }: Mail,
): Promise<void> {
  const sender = setup.addresses.find(({ name }) => name === from)
  if (!sender) throw new Error(`resend.json has no address named ${from}.`)

  const { error } = await client.emails.send({
    ...mail,
    from: `${sender.displayName} <${sender.address}>`,
  })
  if (error) throw new Error(`Could not send the mail: ${error.message}`)
}

// The name of the inbound address that the mail went to. Mail for another
// repo on the shared domain finds nothing.
export function findInboundAddress(recipients: string[]): string | undefined {
  const addresses = recipients.map(toAddress)
  return setup.addresses.find(
    ({ address, inbound }) => inbound && addresses.includes(address),
  )?.name
}
