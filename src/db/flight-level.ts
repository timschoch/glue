import type { ConceptDb } from './client.ts'
import { listAssignments, listMembers } from './members.ts'
import { listParts } from './parts.ts'
import type { PartSummary } from './parts.ts'
import type { LoopStep, PartType } from './schema.ts'
import { stepTypes } from './step-types.ts'

// How much a member sees of a Part (D31): Operational shows the Part in
// detail, Strategic shows it in the summary of its Concept. No data is
// hidden: a member opens each Part.
export const flightLevels = ['operational', 'strategic'] as const

export type FlightLevel = (typeof flightLevels)[number]

export type LeveledPart = PartSummary & { flightLevel: FlightLevel }

// The Parts of the Project, each with its flight level for the member with
// the e-mail address.
export async function listLeveledParts(
  db: ConceptDb,
  projectSlug: string,
  memberEmail?: string,
  types?: PartType[],
): Promise<LeveledPart[]> {
  const [found, members, assignments] = await Promise.all([
    listParts(db, projectSlug, types),
    listMembers(db, projectSlug),
    listAssignments(db, projectSlug),
  ])
  const email = memberEmail?.trim().toLowerCase()
  const member = members.find((known) => known.email.toLowerCase() === email)
  const steps: ReadonlyArray<LoopStep> = member?.loopSteps ?? []
  const ownTypes = new Set<PartType>(steps.flatMap((step) => stepTypes[step]))
  // The record ids and the Concept slugs where the member is Responsible or
  // Co-Author.
  const assigned = new Set(
    assignments
      .filter(({ memberId }) => memberId === member?.id)
      .map(({ part, concept }) => part ?? concept),
  )

  return found.map((part) => ({
    ...part,
    flightLevel:
      ownTypes.has(part.type) ||
      assigned.has(part.id) ||
      assigned.has(part.concept)
        ? 'operational'
        : 'strategic',
  }))
}
