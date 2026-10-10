// The Integration tool for a webhook (glue/D72): the address is a name that
// the member gives it. It has no read: a tool of the team posts its Signals
// to Glue with the secret that Glue made.
import type { IntegrationTool } from '../db/integrations.ts'

const MAX_NAME_LENGTH = 60

export const webhookTool: IntegrationTool = {
  label: 'Webhook',
  addressFields: [{ label: 'Name' }],
  findAddressProblem: (name) =>
    name.length <= MAX_NAME_LENGTH && /^[\p{L}\p{N} _-]+$/u.test(name)
      ? undefined
      : `A name has at most ${MAX_NAME_LENGTH} characters: letters, digits, spaces, "-" and "_"`,
}
