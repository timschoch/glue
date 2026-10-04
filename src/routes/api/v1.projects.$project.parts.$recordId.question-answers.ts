import { createFileRoute } from '@tanstack/react-router'

import { questionAnswersHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute(
  '/api/v1/projects/$project/parts/$recordId/question-answers',
)({
  server: { handlers: questionAnswersHandlers },
})
