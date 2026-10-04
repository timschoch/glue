import { getRouteApi } from '@tanstack/react-router'

import type { Concept } from '../db/parts.ts'
import { ConceptView } from '../design-system/concept-view.tsx'
import { NameFormScreen } from './name-form-screen.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { isPartType, lensTypes } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// One Concept in the main window, with the lens of the section. The form
// that the address names takes its place.
export function ConceptScreen({ concept }: { concept: Concept }) {
  const { parts } = projectRoute.useLoaderData()
  const { search, conceptHref, recordHref, open, changeSearch } =
    useProjectLinks()

  if (isPartType(search.add)) {
    // The key gives each Part type its own form with its own values.
    return <PartFormScreen key={search.add} type={search.add} parts={parts} />
  }
  if (search.add) return <NameFormScreen key={search.add} added={search.add} />

  return (
    <ConceptView
      concept={concept}
      types={lensTypes(search.section)}
      partHref={recordHref}
      conceptHref={({ slug }) => conceptHref(slug)}
      onOpenPart={(part, event) => open(recordHref(part), event)}
      onOpenConcept={({ slug }, event) => open(conceptHref(slug), event)}
      onAddPart={(type) => void changeSearch({ ...search, add: type })}
      onAddConcept={() => void changeSearch({ ...search, add: 'concept' })}
    />
  )
}
