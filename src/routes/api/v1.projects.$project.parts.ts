import { createFileRoute } from '@tanstack/react-router'

import { partsHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/parts')({
  server: { handlers: partsHandlers },
})
