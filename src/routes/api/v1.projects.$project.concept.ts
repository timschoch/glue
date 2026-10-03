import { createFileRoute } from '@tanstack/react-router'

import { conceptHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/concept')({
  server: { handlers: conceptHandlers },
})
