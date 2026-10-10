import { createFileRoute } from '@tanstack/react-router'

import { integrationsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/integrations')({
  server: { handlers: integrationsHandlers },
})
