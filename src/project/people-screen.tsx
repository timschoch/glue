import { getRouteApi } from '@tanstack/react-router'

import type { Assignment, AssignmentRole } from '../db/members.ts'
import type { ConceptNode } from '../db/parts.ts'
import { People } from '../design-system/people.tsx'
import type { PeopleHeld } from '../design-system/people.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// A Concept and each Concept in it.
function flatten(concept: ConceptNode): Array<ConceptNode> {
  return [concept, ...concept.concepts.flatMap(flatten)]
}

// The section People in the main window: the members of the Project. A
// member sets the own loop steps and adds other members.
export function PeopleScreen() {
  const { project: tree, parts, people } = projectRoute.useLoaderData()
  const { addMember, setLoopSteps } = projectRoute.useRouteContext()
  const { project, search, conceptHref, recordHref, open } = useProjectLinks()
  const { pending, failure, write } = useWrite()
  const concepts = flatten(tree.concept)

  function held(
    memberId: number,
    role: AssignmentRole,
    assignments: ReadonlyArray<Assignment>,
  ): PeopleHeld {
    const own = assignments.filter(
      (assignment) =>
        assignment.memberId === memberId && assignment.role === role,
    )
    return {
      concepts: concepts
        .filter(({ slug }) => own.some(({ concept }) => concept === slug))
        .map(({ slug, title }) => ({
          slug,
          title,
          // A Concept opens with all its Parts, not with the people.
          href: conceptHref(slug, { pins: search.pins }),
        })),
      parts: parts
        .filter(({ id }) => own.some(({ part }) => part === id))
        .map((part) => ({
          id: part.id,
          type: part.type,
          title: part.title,
          trust: part.trust,
          href: recordHref(part),
        })),
    }
  }

  const member = people.me !== null

  return (
    <People
      members={people.members.map(({ id, name, email, loopSteps }) => ({
        id,
        name,
        email,
        loopSteps,
        responsible: held(id, 'responsible', people.assignments),
        coAuthor: held(id, 'co-author', people.assignments),
      }))}
      me={people.me}
      onLoopStepsChange={
        member
          ? (loopSteps) =>
              void write('Saving', () => setLoopSteps({ project, loopSteps }))
          : undefined
      }
      onAddMember={
        member
          ? (email) => void write('Adding', () => addMember({ project, email }))
          : undefined
      }
      onOpen={open}
      pending={pending}
      error={failure}
    />
  )
}
