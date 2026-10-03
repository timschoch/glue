import type { DecisionStatus } from '../src/db/concept-fields.ts'

export type Decision = {
  status: DecisionStatus
  superseded_by?: string
}

export function problems(input: {
  body: string
  files: string[]
  decisions: Map<string, Decision>
}): string[]

export function isBotBranch(ref: string): boolean
