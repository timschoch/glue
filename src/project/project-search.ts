import type { PartType } from '../db/parts.ts'
import { isRecordId } from '../db/record-id.ts'
import type { Section } from '../design-system/frame.tsx'

// What the address of a Project screen keeps beside its path, so a reload
// and a shared link show the same screen.
export type ProjectSearch = {
  // The lens. Without it the Concept shows all its Parts.
  section?: Section
  // The pinned records, newest first.
  pins?: Array<string>
  // The records opened on the way to the open record, oldest first.
  trail?: Array<string>
}

// The Concept in the address of a record whose home Concept is not known,
// as in an address from before the Part model. The record route sends the
// record to its home Concept.
export const UNKNOWN_CONCEPT = 'concept'

// The Part types of each section: the loop steps of a Part type in
// docs/concept.md. Mine and People have no Parts yet.
const lenses: Record<Section, ReadonlyArray<PartType>> = {
  Mine: [],
  Understand: ['insight'],
  Decide: ['goal', 'decision', 'guardrail', 'flow', 'metric'],
  Design: ['guardrail', 'entity', 'flow'],
  Build: ['guardrail', 'entity'],
  Use: ['metric'],
  People: [],
}

export function lensTypes(
  section: Section | undefined,
): ReadonlyArray<PartType> | undefined {
  return section && lenses[section]
}

function isSection(value: unknown): value is Section {
  return typeof value === 'string' && Object.hasOwn(lenses, value)
}

// The record ids of a parameter, each one once. No id: no parameter.
function parseRecordIds(value: unknown): Array<string> | undefined {
  if (!Array.isArray(value)) return undefined
  const recordIds = value.filter(
    (item): item is string => typeof item === 'string' && isRecordId(item),
  )
  return recordIds.length > 0 ? [...new Set(recordIds)] : undefined
}

export function parseProjectSearch(
  search: Record<string, unknown>,
): ProjectSearch {
  return {
    section: isSection(search.section) ? search.section : undefined,
    pins: parseRecordIds(search.pins),
    trail: parseRecordIds(search.trail),
  }
}

// The search after a record opens. `open` is the record in the main window
// now: it joins the trail. A record of the trail that opens again ends the
// trail before itself, so a record is in the trail once.
export function openRecord(
  search: ProjectSearch,
  open: string | undefined,
  recordId: string,
): ProjectSearch {
  const opened = open ? [...(search.trail ?? []), open] : []
  const at = opened.indexOf(recordId)
  return {
    ...search,
    trail: parseRecordIds(at < 0 ? opened : opened.slice(0, at)),
  }
}

// The search after a record gets its pin or loses it.
export function changePin(
  search: ProjectSearch,
  recordId: string,
  pinned: boolean,
): ProjectSearch {
  const others = (search.pins ?? []).filter((pin) => pin !== recordId)
  return {
    ...search,
    pins: parseRecordIds(pinned ? [recordId, ...others] : others),
  }
}
