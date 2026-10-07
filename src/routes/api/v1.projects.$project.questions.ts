import { createFileRoute } from '@tanstack/react-router'

import { questionsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/questions')({
  server: { handlers: questionsHandlers },
})
