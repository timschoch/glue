import { createFileRoute } from '@tanstack/react-router'

import { jointsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/joints')({
  server: { handlers: jointsHandlers },
})
