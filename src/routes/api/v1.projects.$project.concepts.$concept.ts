import { createFileRoute } from '@tanstack/react-router'

import { projectConceptHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/concepts/$concept',
)({
  server: { handlers: projectConceptHandlers },
})
