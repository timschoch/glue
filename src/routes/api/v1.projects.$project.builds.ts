import { createFileRoute } from '@tanstack/react-router'

import { buildsHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/builds')({
  server: { handlers: buildsHandlers },
})
