import type { ConceptDb } from '../db/client.ts'
import type { SignalSource } from '../db/signals.ts'
import type { GithubClient } from '../github/client.ts'
import { findSetting } from '../settings.server.ts'
import { createServerIntegrations } from './integrations.server.ts'
import { signalSources } from './signal-sources.ts'
import type { SourceTools } from './signal-sources.ts'

// The Signal sources of the Project, each with its tool from the settings of
// the server. A source that the Project has an Integration for reads with
// the key of the team, and each webhook of the Project is one more source.
// The list of the adapters: signal-sources.ts.
export function createSignalSources(
  github: GithubClient,
  db: ConceptDb,
  projectSlug: string,
): Promise<ReadonlyArray<SignalSource>> {
  const tools: SourceTools = {
    github,
    analytics: {
      url: findSetting('MOCK_ANALYTICS_URL'),
      readKey: findSetting('MOCK_ANALYTICS_READ_KEY'),
    },
    social: {
      url: findSetting('MOCK_SOCIAL_URL'),
      readKey: findSetting('MOCK_SOCIAL_READ_KEY'),
    },
  }
  return createServerIntegrations(db).toSources(
    projectSlug,
    Object.values(signalSources).map((create) => create(tools)),
  )
}
