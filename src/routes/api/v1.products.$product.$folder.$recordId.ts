import { createFileRoute } from '@tanstack/react-router'

import { handleGetRecord, handleUpdateDecision } from '../../api/concept-api.ts'
import { createDb } from '../../db/client.ts'
import { getSetting } from '../../settings.server.ts'

export const Route = createFileRoute(
  '/api/v1/products/$product/$folder/$recordId',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleGetRecord({
          db: createDb(getSetting('DATABASE_URL')),
          request,
          params,
        }),
      PATCH: ({ request, params }) =>
        handleUpdateDecision({
          db: createDb(getSetting('DATABASE_URL')),
          request,
          params,
        }),
    },
  },
})
