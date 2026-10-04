import type { Concept } from '../db/parts.ts'
import { ConceptView } from '../design-system/concept-view.tsx'
import { toConceptViewPart } from './part-views.ts'
import { lensTypes } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'

// One Concept in the main window, with the lens of the section.
export function ConceptScreen({ concept }: { concept: Concept }) {
  const { search, conceptHref, recordHref, open } = useProjectLinks()

  return (
    <ConceptView
      concept={{
        ...concept,
        parts: concept.parts.map(toConceptViewPart),
        linkedParts: concept.linkedParts.map(toConceptViewPart),
      }}
      types={lensTypes(search.section)}
      partHref={recordHref}
      conceptHref={({ slug }) => conceptHref(slug)}
      onOpenPart={(part, event) => open(recordHref(part), event)}
      onOpenConcept={({ slug }, event) => open(conceptHref(slug), event)}
    />
  )
}
