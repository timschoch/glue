import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { ConceptNode, PartSummary, Project } from '../db/parts.ts'
import { Frame } from '../design-system/frame.tsx'
import { listLoopSteps } from './loop-steps.ts'
import { changePin } from './project-search.ts'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

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
  measured,
  newFlagCount,
  children,
}: {
  project: Project
  projects: ReadonlyArray<Pick<Project, 'slug' | 'name'>>
  // The Parts of the Project: the trail and the pins take their titles here.
  parts: ReadonlyArray<PartSummary>
  // The Parts that the section Use lists.
  measured: ReadonlyArray<Pick<PartSummary, 'concept'>>
  // The count of the flags that the person did not see yet (glue/D61).
  newFlagCount: number
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { signOut } = projectRoute.useRouteContext()
  const { pending, failure, write } = useWrite()
  const {
    concept,
    recordId,
    search,
    conceptHref,
    recordHref,
    open,
    changeSearch,
  } = useProjectLinks()
  // Mine and People belong to the Project: a Concept opens without them.
  const isOfProject = search.section === 'Mine' || search.section === 'People'
  const toLink = (node: ConceptNode) => ({
    name: node.title,
    href: isOfProject
      ? conceptHref(node.slug, { pins: search.pins })
      : conceptHref(node.slug),
  })
  const conceptPath = findConceptPath(project.concept, concept)
  const openConcept = conceptPath.at(-1) ?? project.concept
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
      newFlagCount={newFlagCount}
      mineHref={conceptHref(project.slug, {
        section: 'Mine',
        pins: search.pins,
      })}
      peopleHref={conceptHref(project.slug, {
        section: 'People',
        pins: search.pins,
      })}
      // The Project itself opens as the map of the whole Project. It keeps
      // the loop step.
      rootHref={conceptHref(project.slug, {
        section: isOfProject ? undefined : search.section,
        pins: search.pins,
        view: 'map',
      })}
      // The steps belong to the open Concept. Mine and People open on the
      // Project, so there the steps are the ones of the whole Project.
      steps={listLoopSteps(openConcept, parts, measured).map((step) => ({
        ...step,
        // A second click on the step takes the lens away.
        href: conceptHref(concept, {
          section: step.name === search.section ? undefined : step.name,
          pins: search.pins,
          view: search.view,
        }),
      }))}
      concepts={project.concept.concepts.map((node) => ({
        ...toLink(node),
        concepts:
          node.concepts.length > 0 ? node.concepts.map(toLink) : undefined,
      }))}
      conceptPath={conceptPath.map(toLink)}
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
      // So does this form: the new Concept is at the top level.
      onAddConcept={() =>
        void navigate({
          to: '/$project',
          params: { project: project.slug },
          search: { add: 'concept' },
        })
      }
      onSignOut={() =>
        void write(
          'Signing out',
          () => signOut(),
          () => navigate({ to: '/sign-in' }),
        )
      }
      signOutPending={pending}
      signOutFailure={failure}
    >
      {children}
    </Frame>
  )
}
