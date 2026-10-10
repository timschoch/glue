import type { IntegrationTool } from '../db/integrations.ts'
import { createGithubTool } from './github-tool.ts'
import { createPosthogTool } from './posthog-tool.ts'
import { webhookTool } from './webhook-tool.ts'

// The tools of an Integration, each adapter under its name (glue/R9). A new
// tool is one adapter file and one more line in this list. No other module
// imports an adapter or names a tool.
export const integrationTools: Readonly<Record<string, IntegrationTool>> = {
  github: createGithubTool(),
  posthog: createPosthogTool(),
  webhook: webhookTool,
}
