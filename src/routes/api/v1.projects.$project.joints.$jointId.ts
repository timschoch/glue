import { createFileRoute } from '@tanstack/react-router'

import { jointHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/joints/$jointId',
)({
  server: { handlers: jointHandlers },
})
