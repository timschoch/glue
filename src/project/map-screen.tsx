import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import type { SyntheticEvent } from 'react'

import type { ConceptNode, MapJoint, Part } from '../db/parts.ts'
import { partTypes } from '../design-system/card.tsx'
import { ConceptMap } from '../design-system/concept-map.tsx'
import { ConceptSummary } from '../design-system/concept-view.tsx'
import { MapPanel } from '../design-system/map-panel.tsx'
import { lensTypes } from './project-search.ts'
import type { ProjectSearch } from './project-search.ts'
import { RecordScreen } from './record-screen.tsx'
import { isForBrowser, useProjectLinks } from './use-project-links.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

const NONE: ReadonlyArray<string> = []

function findConcept(
  concept: ConceptNode,
  slug: string,
): ConceptNode | undefined {
  if (concept.slug === slug) return concept
  for (const child of concept.concepts) {
    const found = findConcept(child, slug)
    if (found) return found
  }
  return undefined
}

// What is open on the Map lives in the address. A change keeps the page
// where it is: the Map does not jump.
function useMapSearch() {
  const router = useRouter()
  const search = projectRoute.useSearch()

  return useCallback(
    (change: Pick<ProjectSearch, 'expanded' | 'panel'>) =>
      router.navigate({
        to: '.',
        search: { ...search, ...change },
        resetScroll: false,
      }),
    [router, search],
  )
}

// The Map of the Concept `focus`, with the lens of the section. The Map of
// the root Concept is the Map of the Project.
export function MapScreen({
  focus,
  joints,
}: {
  focus: string
  joints: ReadonlyArray<MapJoint>
}) {
  const router = useRouter()
  const { project, parts } = projectRoute.useLoaderData()
  const { search, conceptHref, recordHref } = useProjectLinks()
  const changeMap = useMapSearch()
  const { section } = search
  const shown = useMemo(() => {
    const types = lensTypes(section)
    return types ? parts.filter(({ type }) => types.includes(type)) : parts
  }, [parts, section])
  const projectHref = useCallback(
    (slug: string) =>
      router.buildLocation({ to: '/$project', params: { project: slug } }).href,
    [router],
  )

  // A click that the browser keeps opens the full page.
  function openPanel(panel: string, event: SyntheticEvent) {
    if (isForBrowser(event)) return
    event.preventDefault()
    void changeMap({ panel })
  }

  return (
    <ConceptMap
      tree={project.concept}
      parts={shown}
      joints={joints}
      focus={focus}
      expanded={search.expanded ?? NONE}
      current={search.panel}
      onExpandedChange={(expanded) =>
        void changeMap({
          expanded: expanded.length > 0 ? expanded : undefined,
        })
      }
      partHref={recordHref}
      conceptHref={conceptHref}
      projectHref={projectHref}
      onOpenPart={({ id }, event) => openPanel(id, event)}
      onOpenConcept={openPanel}
    />
  )
}

// The panel beside the Map: the record or the Concept that the address
// names. `part` is the record of the address, when it names one.
export function MapPanelScreen({ part }: { part?: Part }) {
  const { project, parts } = projectRoute.useLoaderData()
  const { search, conceptHref, recordHref, open } = useProjectLinks()
  const changeMap = useMapSearch()
  const close = useCallback(
    () => void changeMap({ panel: undefined }),
    [changeMap],
  )

  if (search.panel === undefined) return null
  if (part?.id === search.panel) {
    const href = recordHref(part)
    return (
      <MapPanel
        name={`${partTypes[part.type]} ${part.id}`}
        href={href}
        onOpen={(event) => open(href, event)}
        onClose={close}
      >
        <RecordScreen part={part} parts={parts} />
      </MapPanel>
    )
  }
  const concept = findConcept(project.concept, search.panel)
  if (!concept) return null
  const href = conceptHref(concept.slug)

  return (
    <MapPanel
      name={concept.title}
      href={href}
      onOpen={(event) => open(href, event)}
      onClose={close}
    >
      <ConceptSummary concept={concept} />
    </MapPanel>
  )
}
