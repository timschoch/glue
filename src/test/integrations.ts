import type { ConceptDb } from '../db/client.ts'
import {
  IntegrationReadError,
  createIntegrationOperations,
} from '../db/integrations.ts'
import type { IntegrationTool } from '../db/integrations.ts'

// No real key: the fake tool takes this one only.
export const TEAM_KEY = 'key-of-the-team-1234'

// No real secret: the fake Integrations give this one to each new webhook.
export const WEBHOOK_SECRET = 'secret-of-the-webhook-abcd'

// GitHub as an Integration tool, with no request. It has one Signal, and it
// refuses each key that is not TEAM_KEY.
export const fakeGithubTool: IntegrationTool = {
  label: 'GitHub',
  addressFields: [{ label: 'Repository' }],
  findAddressProblem: (address) =>
    address.includes('/') ? undefined : 'A repository is owner/name',
  listSignals: async (address, key) => {
    if (key !== TEAM_KEY)
      throw new IntegrationReadError('GitHub refused the key', 'key')
    return [
      {
        url: `https://github.com/${address}/issues/7`,
        title: 'The list is slow',
        text: '',
        date: '2026-10-02',
      },
    ]
  },
}

// A webhook as an Integration tool: it has no read, so it posts to Glue.
export const fakeWebhookTool: IntegrationTool = {
  label: 'Webhook',
  addressFields: [{ label: 'Name' }],
  findAddressProblem: () => undefined,
}

// The Integrations with the fake tools, a test secret, a clock that stands
// still and one secret for each new webhook.
export const createFakeIntegrations = (db: ConceptDb) =>
  createIntegrationOperations({
    db,
    secret: 'secret-of-the-server-0123456789ab',
    tools: { github: fakeGithubTool, webhook: fakeWebhookTool },
    now: () => new Date('2026-10-10T08:00:00.000Z'),
    createWebhookSecret: () => WEBHOOK_SECRET,
  })
