import type { ConceptDb } from '../db/client.ts'
import { createIntegrationOperations } from '../db/integrations.ts'
import type { IntegrationOperations } from '../db/integrations.ts'
import { createGithubClient } from '../github/client.ts'
import { findSetting } from '../settings.server.ts'
import { integrationTools } from './integration-tools.ts'
import type { ToolClients } from './integration-tools.ts'

const clients: ToolClients = {
  createGithub: (key) => createGithubClient(() => key),
}

// The Integrations of the server: the real tools, and the secret from the
// settings of the server.
export function createServerIntegrations(db: ConceptDb): IntegrationOperations {
  return createIntegrationOperations({
    db,
    secret: findSetting('INTEGRATION_KEY_SECRET'),
    tools: Object.fromEntries(
      Object.entries(integrationTools).map(([name, create]) => [
        name,
        create(clients),
      ]),
    ),
  })
}
