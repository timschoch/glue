import { createFileRoute } from '@tanstack/react-router'

import { projectHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/')({
  server: { handlers: projectHandlers },
})
