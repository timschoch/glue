import type { SignalSource } from '../db/signals.ts'
import type { GithubClient } from '../github/client.ts'
import { findSetting } from '../settings.server.ts'
import { createAnalyticsSource } from './analytics-source.ts'
import { createGithubSource } from './github-source.ts'
import { createSupportSource } from './support-source.ts'

// The Signal sources of Glue. A new tool is one more adapter in this list.
export function createSignalSources(
  github: GithubClient,
): ReadonlyArray<SignalSource> {
  return [
    createGithubSource(github),
    createSupportSource(),
    createAnalyticsSource({
      url: findSetting('MOCK_ANALYTICS_URL'),
      readKey: findSetting('MOCK_ANALYTICS_READ_KEY'),
    }),
  ]
}
