import { createFileRoute, redirect } from '@tanstack/react-router'

import { landingSection } from '../project/project-search.ts'

// Without a Project in the address, Glue shows its own Concept, in the
// section of the member.
export const Route = createFileRoute('/_signed-in/')({
  beforeLoad: async ({ context }) => {
    const [mine, people] = await Promise.all([
      context.fetchMine('glue'),
      context.fetchPeople('glue'),
    ])
    const member = people.members.find(({ id }) => id === people.me)
    throw redirect({
      to: '/$project',
      params: { project: 'glue' },
      search: { section: landingSection(mine.length, member?.loopSteps ?? []) },
    })
  },
})
