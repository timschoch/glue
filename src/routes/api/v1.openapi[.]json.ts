import { createFileRoute } from '@tanstack/react-router'

import { handleGetOpenApi } from '../../api/openapi.ts'

export const Route = createFileRoute('/api/v1/openapi.json')({
  server: { handlers: { GET: handleGetOpenApi } },
})
