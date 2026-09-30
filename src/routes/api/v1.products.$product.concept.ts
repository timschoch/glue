import { createFileRoute } from '@tanstack/react-router'

import { handleGetConcept } from '../../api/concept-api.ts'
import { createDb } from '../../db/client.ts'
import { getSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/v1/products/$product/concept')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleGetConcept({
          db: createDb(getSetting('DATABASE_URL')),
          request,
          params,
        }),
    },
  },
})
