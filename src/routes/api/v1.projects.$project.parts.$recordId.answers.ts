import { createFileRoute } from '@tanstack/react-router'

import { answersHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/parts/$recordId/answers',
)({
  server: { handlers: answersHandlers },
})
