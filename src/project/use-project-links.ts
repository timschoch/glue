import { getRouteApi, useParams, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { SyntheticEvent } from 'react'

import { openRecord } from './project-search.ts'
import type { ProjectSearch } from './project-search.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// A click that the browser keeps: it opens a new tab or a new window.
function isForBrowser({ nativeEvent }: SyntheticEvent): boolean {
  return (
    nativeEvent instanceof MouseEvent &&
    (nativeEvent.button !== 0 ||
      nativeEvent.metaKey ||
      nativeEvent.ctrlKey ||
      nativeEvent.shiftKey ||
      nativeEvent.altKey)
  )
}

// The addresses of a Project screen, and the way to open them without a
// load of the whole page. The design system components get both as plain
// data and callbacks.
export function useProjectLinks() {
  const router = useRouter()
  const { project } = projectRoute.useParams()
  const search = projectRoute.useSearch()
  const { concept, recordId } = useParams({ strict: false })
  const { section, pins } = search

  // A Concept opens with the lens and the pins. The trail ends.
  const conceptHref = useCallback(
    (slug: string, conceptSearch: ProjectSearch = { section, pins }) =>
      // The root Concept is the start of the Project.
      slug === project
        ? router.buildLocation({
            to: '/$project',
            params: { project },
            search: conceptSearch,
          }).href
        : router.buildLocation({
            to: '/$project/$concept',
            params: { project, concept: slug },
            search: conceptSearch,
          }).href,
    [router, project, section, pins],
  )

  // A record opens in its home Concept. The open record joins the trail.
  const recordHref = useCallback(
    (part: { id: string; concept: string }) =>
      router.buildLocation({
        to: '/$project/$concept/$recordId',
        params: { project, concept: part.concept, recordId: part.id },
        search: openRecord(search, recordId, part.id),
      }).href,
    [router, project, search, recordId],
  )

  const open = useCallback(
    (href: string, event: SyntheticEvent) => {
      if (isForBrowser(event)) return
      event.preventDefault()
      void router.navigate({ href })
    },
    [router],
  )

  // The same page with another search: a pin more or a pin less.
  const changeSearch = useCallback(
    (next: ProjectSearch) => void router.navigate({ to: '.', search: next }),
    [router],
  )

  return {
    project,
    // Without a Concept in the address, the root Concept is open.
    concept: concept ?? project,
    recordId,
    search,
    conceptHref,
    recordHref,
    open,
    changeSearch,
  }
}
