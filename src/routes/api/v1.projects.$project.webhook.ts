import { createFileRoute } from '@tanstack/react-router'

import { webhookHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/webhook')({
  server: { handlers: webhookHandlers },
})
