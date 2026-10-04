import { createFileRoute } from '@tanstack/react-router'

import { projectConceptsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/concepts')({
  server: { handlers: projectConceptsHandlers },
})
