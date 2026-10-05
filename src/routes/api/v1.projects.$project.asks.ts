import { createFileRoute } from '@tanstack/react-router'

import { asksHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/asks')({
  server: { handlers: asksHandlers },
})
