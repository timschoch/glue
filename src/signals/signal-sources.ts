import type { SignalSource } from '../db/signals.ts'
import type { GithubClient } from '../github/client.ts'
import { createAnalyticsSource } from './analytics-source.ts'
import { createGithubSource } from './github-source.ts'
import { createMarketSource } from './market-source.ts'
import type { SourceName } from './signal-source-names.ts'
import { createSocialSource } from './social-source.ts'
import { createSupportSource } from './support-source.ts'

// The address and the read key of a Mock. The server reads them from its
// settings.
type MockTool = { url: string | undefined; readKey: string | undefined }

// What the adapters read their tools with.
export type SourceTools = {
  github: GithubClient
  analytics: MockTool
  social: MockTool
}

// The Signal sources of Glue, each adapter under its name. A new tool is
// one more name in signal-source-names.ts and one more adapter in this
// list: the screen takes the names alone.
export const signalSources = {
  github: ({ github }) => createGithubSource(github),
  support: () => createSupportSource(),
  analytics: ({ analytics }) => createAnalyticsSource(analytics),
  social: ({ social }) => createSocialSource(social),
  market: () => createMarketSource(),
} satisfies Record<SourceName, (tools: SourceTools) => SignalSource>
