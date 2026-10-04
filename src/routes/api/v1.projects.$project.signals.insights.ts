import { createFileRoute } from '@tanstack/react-router'

import { signalInsightsHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/signals/insights',
)({
  server: { handlers: signalInsightsHandlers },
})
