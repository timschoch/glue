import { createFileRoute } from '@tanstack/react-router'

import { recordHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/$folder/$recordId',
)({
  server: { handlers: recordHandlers },
})
