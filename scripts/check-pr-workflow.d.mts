import type { DecisionStatus } from '../src/db/schema.ts'

export type Decision = {
  status: DecisionStatus
  superseded_by?: string
}

export function problems(input: {
  body: string
  files: string[]
  decisions: Map<string, Decision>
}): string[]
