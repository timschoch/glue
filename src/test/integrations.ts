import type { ConceptDb } from '../db/client.ts'
import {
  IntegrationReadError,
  createIntegrationOperations,
} from '../db/integrations.ts'
import type { IntegrationTool } from '../db/integrations.ts'

// No real key: the fake tool takes this one only.
export const TEAM_KEY = 'key-of-the-team-1234'

// GitHub as an Integration tool, with no request. It has one Signal, and it
// refuses each key that is not TEAM_KEY.
export const fakeGithubTool: IntegrationTool = {
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

// The Integrations with the fake tool, a test secret and a clock that
// stands still.
export const createFakeIntegrations = (db: ConceptDb) =>
  createIntegrationOperations({
    db,
    secret: 'secret-of-the-server-0123456789ab',
    tools: { github: fakeGithubTool },
    now: () => new Date('2026-10-10T08:00:00.000Z'),
  })
