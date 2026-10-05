import { partTypes } from './schema.ts'
import type { PartType } from './schema.ts'

// The first letter of the record id of each Part type (D38). R is for rule.
export const RECORD_LETTERS: Record<PartType, string> = {
  insight: 'I',
  goal: 'G',
  decision: 'D',
  guardrail: 'R',
  entity: 'E',
  flow: 'F',
  metric: 'M',
}

const RECORD_ID = new RegExp(
  `^[${Object.values(RECORD_LETTERS).join('')}]\\d+$`,
)

export function isRecordId(value: string): boolean {
  return RECORD_ID.test(value)
}

// The Part type that the first letter of a record id names.
export function typeOfRecordId(recordId: string): PartType | undefined {
  if (!isRecordId(recordId)) return undefined
  return partTypes.find((type) => RECORD_LETTERS[type] === recordId[0])
}

// A record id as a write names it: `D4`, or `glue/D4` for the Part of
// another Project (D45).
export function parseRecordReference(reference: string): {
  project?: string
  recordId: string
} {
  const slash = reference.lastIndexOf('/')
  return slash === -1
    ? { recordId: reference }
    : {
        project: reference.slice(0, slash),
        recordId: reference.slice(slash + 1),
      }
}

// Ids sort by their number: D2 comes before D10.
export function sortById<TItem extends { id: string }>(
  items: TItem[],
): TItem[] {
  return items.sort(
    (left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
  )
}
