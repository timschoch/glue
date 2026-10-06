import { createFileRoute } from '@tanstack/react-router'

import { askHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/asks/$askId')({
  server: { handlers: askHandlers },
})
