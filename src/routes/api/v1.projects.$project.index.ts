import { createFileRoute } from '@tanstack/react-router'

import { projectHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/')({
  server: { handlers: projectHandlers },
})
