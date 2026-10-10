import type { ConceptDb } from '../db/client.ts'
import { createIntegrationOperations } from '../db/integrations.ts'
import type { IntegrationOperations } from '../db/integrations.ts'
import { findSetting } from '../settings.server.ts'
import { integrationTools } from './integration-tools.ts'

// The Integrations of the server: the real tools, and the secret from the
// settings of the server.
export function createServerIntegrations(db: ConceptDb): IntegrationOperations {
  return createIntegrationOperations({
    db,
    secret: findSetting('INTEGRATION_KEY_SECRET'),
    tools: integrationTools,
  })
}
