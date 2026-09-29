export type ConceptRecordType = {
  prefix: string
  required: string[]
}

export const TYPES: {
  goals: ConceptRecordType
  decisions: ConceptRecordType
  insights: ConceptRecordType
  facts: ConceptRecordType
  guardrails: ConceptRecordType
}

export type ConceptRecord = {
  folder: keyof typeof TYPES
  type: ConceptRecordType
  file: string
  path: string
  data: Record<string, unknown> | null
  errors: string[]
}

export function loadConcept(root: string): ConceptRecord[]
export function problems(records: ConceptRecord[]): string[]
