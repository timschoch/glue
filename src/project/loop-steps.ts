import type { ConceptNode, PartSummary } from '../db/parts.ts'
import { loopSections } from '../design-system/frame.tsx'
import type { LoopSection } from '../design-system/frame.tsx'
import { lensTypes } from './project-search.ts'

// The slugs of the Concepts and of each Concept in them.
export function listSlugs(concepts: ReadonlyArray<ConceptNode>): Array<string> {
  return concepts.flatMap((node) => [node.slug, ...listSlugs(node.concepts)])
}

// The steps of the loop for a Concept, in loop order. A step has Parts when
// its section lists one: a Part of its types whose home is the Concept or a
// Concept in it. The section Use lists the measured Parts.
export function listLoopSteps(
  concept: ConceptNode,
  parts: ReadonlyArray<Pick<PartSummary, 'type' | 'concept'>>,
  measured: ReadonlyArray<Pick<PartSummary, 'concept'>>,
): Array<{ name: LoopSection; hasParts: boolean }> {
  const homes = new Set([concept.slug, ...listSlugs(concept.concepts)])
  return loopSections.map((name) => ({
    name,
    hasParts:
      name === 'Use'
        ? measured.some((part) => homes.has(part.concept))
        : parts.some(
            (part) =>
              lensTypes(name)?.includes(part.type) && homes.has(part.concept),
          ),
  }))
}
