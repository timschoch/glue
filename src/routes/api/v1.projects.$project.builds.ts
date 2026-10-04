import { createFileRoute } from '@tanstack/react-router'

import { buildsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/builds')({
  server: { handlers: buildsHandlers },
})
