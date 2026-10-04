import { createFileRoute } from '@tanstack/react-router'

import { membersHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/members')({
  server: { handlers: membersHandlers },
})
