import { createFileRoute } from '@tanstack/react-router'

import { kindHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/kinds/$kind')({
  server: { handlers: kindHandlers },
})
