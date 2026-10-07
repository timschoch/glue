import { createFileRoute } from '@tanstack/react-router'

import { questionHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/questions/$questionId',
)({
  server: { handlers: questionHandlers },
})
