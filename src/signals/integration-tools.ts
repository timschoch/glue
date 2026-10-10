import type { IntegrationTool } from '../db/integrations.ts'
import type { GithubClient } from '../github/client.ts'
import { createGithubTool } from './github-tool.ts'
import type { ToolName } from './integration-tool-names.ts'

// What the adapters reach their tools with. Each one takes the key of the
// team.
export type ToolClients = {
  createGithub: (key: string) => GithubClient
}

// The tools of an Integration, each adapter under its name. A new tool is
// one more name in integration-tool-names.ts and one more adapter in this
// list.
export const integrationTools = {
  github: ({ createGithub }) => createGithubTool(createGithub),
} satisfies Record<ToolName, (clients: ToolClients) => IntegrationTool>
