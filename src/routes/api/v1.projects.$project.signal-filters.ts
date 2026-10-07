import { createFileRoute } from '@tanstack/react-router'

import { signalFiltersHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/signal-filters',
)({
  server: { handlers: signalFiltersHandlers },
})
