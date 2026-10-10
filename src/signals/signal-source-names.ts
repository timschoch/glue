// The names of the Signal sources of Glue. The module imports nothing, so
// the screen takes the names with no adapter. The adapters under these
// names: signal-sources.ts.
export const sourceNames = [
  'github',
  'support',
  'analytics',
  'social',
  'market',
] as const

export type SourceName = (typeof sourceNames)[number]
