import { createFileRoute } from '@tanstack/react-router'

import { signalsHandlers } from '../../api/part-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/signals')({
  server: { handlers: signalsHandlers },
})
