import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { ConceptNode, PartSummary, Project } from '../db/parts.ts'
import { Frame } from '../design-system/frame.tsx'
import { changePin } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The Concepts from the root Concept down to the Concept with the slug.
// A slug that the tree does not have gives the root Concept alone.
export function findConceptPath(
  root: ConceptNode,
  slug: string,
): Array<ConceptNode> {
  function search(node: ConceptNode): Array<ConceptNode> | undefined {
    if (node.slug === slug) return [node]
    for (const child of node.concepts) {
      const found = search(child)
      if (found) return [node, ...found]
    }
    return undefined
  }
  return search(root) ?? [root]
}

// The frame of each screen of a Project. The address says which Concept and
// which record are open, what the trail is and what is pinned.
export function ProjectFrame({
  project,
  projects,
  parts,
  children,
}: {
  project: Project
  projects: ReadonlyArray<Pick<Project, 'slug' | 'name'>>
  // The Parts of the Project: the trail and the pins take their titles here.
  parts: ReadonlyArray<PartSummary>
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { signOut } = projectRoute.useRouteContext()
  const {
    concept,
    recordId,
    search,
    conceptHref,
    recordHref,
    open,
    changeSearch,
  } = useProjectLinks()
  const toLink = (node: ConceptNode) => ({
    name: node.title,
    href: conceptHref(node.slug),
  })
  const found = (recordIds: ReadonlyArray<string> = []) =>
    recordIds.flatMap((id) => parts.find((part) => part.id === id) ?? [])
  const opened = found(recordId ? [recordId] : [])

  return (
    <Frame
      project={project.name}
      projects={projects.map(({ name }) => name)}
      onProjectChange={(name) => {
        const next = projects.find((other) => other.name === name)
        if (next)
          void navigate({ to: '/$project', params: { project: next.slug } })
      }}
      section={search.section}
      // A second click on the section takes the lens away.
      sectionHref={(section) =>
        conceptHref(concept, {
          section: section === search.section ? undefined : section,
          pins: search.pins,
        })
      }
      concepts={project.concept.concepts.map((node) => ({
        ...toLink(node),
        concepts:
          node.concepts.length > 0 ? node.concepts.map(toLink) : undefined,
      }))}
      conceptPath={findConceptPath(project.concept, concept).map(toLink)}
      trail={[...found(opened.length > 0 ? search.trail : []), ...opened].map(
        (part) => ({ name: part.title, href: recordHref(part) }),
      )}
      pinned={found(search.pins).map((part) => ({
        type: part.type,
        recordId: part.id,
        title: part.title,
        trust: part.trust,
        href: recordHref(part),
      }))}
      onUnpin={(pin) => void changeSearch(changePin(search, pin, false))}
      onOpen={open}
      // The form opens in the root Concept of the Project.
      onAddProject={() =>
        void navigate({
          to: '/$project',
          params: { project: project.slug },
          search: { add: 'project' },
        })
      }
      onSignOut={() => void signOut().then(() => navigate({ to: '/sign-in' }))}
    >
      {children}
    </Frame>
  )
}
