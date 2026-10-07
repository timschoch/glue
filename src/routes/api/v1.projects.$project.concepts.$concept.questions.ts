import { createFileRoute } from '@tanstack/react-router'

import { conceptQuestionsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/concepts/$concept/questions',
)({
  server: { handlers: conceptQuestionsHandlers },
})
