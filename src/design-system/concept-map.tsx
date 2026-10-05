import { Suspense, lazy } from 'react'
import type { MouseEvent, SyntheticEvent } from 'react'

import type { MapConcept, MapJoint, MapPart } from './concept-map-layout.ts'
import { useHydrated } from './use-hydrated.ts'

export type ConceptMapProps = {
  // The root Concept of the Project.
  tree: MapConcept
  // The Parts of the lens, of the whole Project.
  parts: ReadonlyArray<MapPart>
  joints: ReadonlyArray<MapJoint>
  // The slug of the Concept of the Map. The root: the Map of the Project.
  focus: string
  // The slugs of the Concepts that are open in place.
  expanded: ReadonlyArray<string>
  onExpandedChange: (expanded: Array<string>) => void
  // What the panel beside the Map shows: the slug of a Concept or the record
  // id of a Part.
  current?: string
  partHref: (part: MapPart) => string
  conceptHref: (slug: string) => string
  // The address of another Project.
  projectHref: (slug: string) => string
  // A Part, a sub Concept and the icon button of an open Concept open with
  // a click or with a key.
  onOpenPart?: (part: MapPart, event: MouseEvent<HTMLAnchorElement>) => void
  onOpenConcept?: (slug: string, event: SyntheticEvent) => void
}

// React Flow and ELK load when a Map shows.
const ConceptMapFlow = lazy(async () => ({
  default: (await import('./concept-map-flow.tsx')).ConceptMapFlow,
}))

// The Map of a Project or of a Concept: Concepts and Parts as nodes, bundles
// of Joints as lines. The browser draws it: the server sends nothing.
export function ConceptMap(props: ConceptMapProps) {
  return (
    useHydrated() && (
      <Suspense>
        <ConceptMapFlow {...props} />
      </Suspense>
    )
  )
}
