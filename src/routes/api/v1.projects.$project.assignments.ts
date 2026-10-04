import { createFileRoute } from '@tanstack/react-router'

import { assignmentsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/assignments')({
  server: { handlers: assignmentsHandlers },
})
