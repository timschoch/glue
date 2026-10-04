import { createFileRoute } from '@tanstack/react-router'

import { measureHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/measure')({
  server: { handlers: measureHandlers },
})
