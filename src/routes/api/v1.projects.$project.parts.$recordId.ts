import { createFileRoute } from '@tanstack/react-router'

import { partHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/parts/$recordId',
)({
  server: { handlers: partHandlers },
})
