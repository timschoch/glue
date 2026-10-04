import { createFileRoute } from '@tanstack/react-router'

import { mineHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/mine')({
  server: { handlers: mineHandlers },
})
