import { createFileRoute } from '@tanstack/react-router'

import { contractHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/concepts/$concept/contract',
)({
  server: { handlers: contractHandlers },
})
