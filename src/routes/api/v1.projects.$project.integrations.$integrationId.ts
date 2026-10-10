import { createFileRoute } from '@tanstack/react-router'

import { integrationHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/integrations/$integrationId',
)({
  server: { handlers: integrationHandlers },
})
