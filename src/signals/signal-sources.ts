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

// The Signal sources that Glue has with no Integration, each adapter under
// its name and with the name that a person reads. A tool of a team is no
// entry here: it is an Integration tool (integration-tools.ts) and gets its
// source from there.
export const signalSources = {
  github: ({ github }) => ({
    ...createGithubSource(github),
    label: 'GitHub',
  }),
  support: () => ({ ...createSupportSource(), label: 'Support' }),
  analytics: ({ analytics }) => ({
    ...createAnalyticsSource(analytics),
    label: 'Analytics',
  }),
  social: ({ social }) => ({ ...createSocialSource(social), label: 'Social' }),
  market: () => ({ ...createMarketSource(), label: 'Market' }),
} satisfies Record<SourceName, (tools: SourceTools) => SignalSource>
