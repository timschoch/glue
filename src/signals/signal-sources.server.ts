import type { SignalSource } from '../db/signals.ts'
import type { GithubClient } from '../github/client.ts'
import { findSetting } from '../settings.server.ts'
import { signalSources } from './signal-sources.ts'
import type { SourceTools } from './signal-sources.ts'

// The Signal sources of Glue, each with its tool from the settings of the
// server. The list of the adapters: signal-sources.ts.
export function createSignalSources(
  github: GithubClient,
): ReadonlyArray<SignalSource> {
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
  return Object.values(signalSources).map((create) => create(tools))
}
