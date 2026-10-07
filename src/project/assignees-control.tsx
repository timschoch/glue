import { getRouteApi } from '@tanstack/react-router'

import { Assignees } from '../design-system/assignees.tsx'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The Responsible and the Co-Authors of one Concept or one Part. A member
// of the Project changes them. A person who is no member reads only.
export function AssigneesControl({
  target,
}: {
  // The slug of the Concept, or the record id of the Part.
  target: { concept: string } | { part: string }
}) {
  const { people } = projectRoute.useLoaderData()
  const { assign, unassign } = projectRoute.useRouteContext()
  const { project } = projectRoute.useParams()
  const { pending, failure, write } = useWrite()
  const held = people.assignments.filter((assignment) =>
    'part' in target
      ? assignment.part === target.part
      : assignment.concept === target.concept,
  )

  return (
    <Assignees
      members={people.members}
      responsible={
        held.find(({ role }) => role === 'responsible')?.memberId ?? null
      }
      coAuthors={held
        .filter(({ role }) => role === 'co-author')
        .map(({ memberId }) => memberId)}
      onChange={
        people.me === null
          ? undefined
          : ({ memberId, role }) => {
              const member = people.members.find(({ id }) => id === memberId)
              if (!member) return
              const assignment = { ...target, member: member.email }
              void write('Saving', () =>
                role
                  ? assign({ project, assignment: { ...assignment, role } })
                  : unassign({ project, assignment }),
              )
            }
      }
      pending={pending}
      error={failure}
    />
  )
}
