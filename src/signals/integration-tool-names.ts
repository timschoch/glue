// The names of the tools that a member connects as an Integration. The
// module imports nothing, so the screen takes the names with no adapter. The
// adapters under these names: integration-tools.ts. A tool has the name of
// the Signal source that its Signals show under.
export const toolNames = ['github'] as const

export type ToolName = (typeof toolNames)[number]
