import { createFileRoute } from '@tanstack/react-router'

import { signalFilterHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/signal-filters/$filterId',
)({
  server: { handlers: signalFilterHandlers },
})
