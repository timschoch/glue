import { createFileRoute } from '@tanstack/react-router'

import { jointHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/joints/$jointId',
)({
  server: { handlers: jointHandlers },
})
