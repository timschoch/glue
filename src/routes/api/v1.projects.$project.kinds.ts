import { createFileRoute } from '@tanstack/react-router'

import { kindsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/kinds')({
  server: { handlers: kindsHandlers },
})
