import { createFileRoute } from '@tanstack/react-router'

import { watchersHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/watchers')({
  server: { handlers: watchersHandlers },
})
