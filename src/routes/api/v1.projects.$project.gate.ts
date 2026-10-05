import { createFileRoute } from '@tanstack/react-router'

import { gateHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/gate')({
  server: { handlers: gateHandlers },
})
