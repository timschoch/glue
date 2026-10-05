import type { LoopStep } from '../db/members.ts'
import type { PartType } from '../db/parts.ts'
import { isRecordId } from '../db/record-id.ts'
import { stepTypes } from '../db/step-types.ts'
import { partTypes } from '../design-system/card.tsx'
import type { Section } from '../design-system/frame.tsx'

// What the address of a Project screen keeps beside its path, so a reload
// and a shared link show the same screen.
export type ProjectSearch = {
  // The lens. Without it the Concept shows all its Parts.
  section?: Section
  // The slug of the one Concept whose Parts the section lists. Without it
  // the section lists the Parts of the whole Project.
  home?: string
  // The section shows each Part in detail, the Strategic ones too.
  detail?: true
  // The pinned records, newest first.
  pins?: Array<string>
  // The records opened on the way to the open record, oldest first.
  trail?: Array<string>
  // The form in the main window in place of the Concept or the record: a
  // new Part of the type, a new Concept or a new Project.
  add?: Added
  // The form with the values of the open record.
  edit?: true
  // The map of the Concept in place of its list.
  view?: 'map'
  // The slugs of the Concepts that are open on the Map.
  expanded?: Array<string>
  // What the panel beside the Map shows: a record id or the slug of a
  // Concept.
  panel?: string
}

const nameForms = ['concept', 'project'] as const

export type Added = PartType | (typeof nameForms)[number]

export function isPartType(value: unknown): value is PartType {
  return typeof value === 'string' && Object.hasOwn(partTypes, value)
}

function isAdded(value: unknown): value is Added {
  return isPartType(value) || nameForms.some((form) => form === value)
}

// The Concept in the address of a record whose home Concept is not known,
// as in an address from before the Part model. The record route sends the
// record to its home Concept.
export const UNKNOWN_CONCEPT = 'concept'

// The Part types of each section. Mine is no lens: it lists the Parts of
// the Project that need the owner. People has no Parts yet.
const lenses: Record<Section, ReadonlyArray<PartType>> = {
  Mine: [],
  Understand: stepTypes.understand,
  Decide: stepTypes.decide,
  Design: stepTypes.design,
  Build: stepTypes.build,
  Use: stepTypes.use,
  People: [],
}

const stepSections = {
  understand: 'Understand',
  decide: 'Decide',
  design: 'Design',
  build: 'Build',
  use: 'Use',
} as const satisfies Record<LoopStep, Section>

// The section that a member sees after sign-in: Mine while it has open
// items, then the first loop step of the member. A member with no loop step
// sees the Concept with no lens.
export function landingSection(
  mineCount: number,
  loopSteps: ReadonlyArray<LoopStep>,
): Section | undefined {
  if (mineCount > 0) return 'Mine'
  const first = loopSteps.at(0)
  return first && stepSections[first]
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

function isSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
}

function parseSlugs(value: unknown): Array<string> | undefined {
  const slugs = Array.isArray(value) ? value.filter(isSlug) : []
  return slugs.length > 0 ? [...new Set(slugs)] : undefined
}

export function parseProjectSearch(
  search: Record<string, unknown>,
): ProjectSearch {
  return {
    section: isSection(search.section) ? search.section : undefined,
    home: isSlug(search.home) ? search.home : undefined,
    detail: search.detail === true ? true : undefined,
    pins: parseRecordIds(search.pins),
    trail: parseRecordIds(search.trail),
    add: isAdded(search.add) ? search.add : undefined,
    edit: search.edit === true ? true : undefined,
    view: search.view === 'map' ? 'map' : undefined,
    expanded: parseSlugs(search.expanded),
    panel:
      isSlug(search.panel) ||
      (typeof search.panel === 'string' && isRecordId(search.panel))
        ? search.panel
        : undefined,
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
