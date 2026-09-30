import { createFileRoute } from '@tanstack/react-router'

import { handleAddRecord, handleListRecords } from '../../api/concept-api.ts'
import { createDb } from '../../db/client.ts'
import { createGithubClient } from '../../github/client.ts'
import { getSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/v1/products/$product/$folder')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleListRecords({
          db: createDb(getSetting('DATABASE_URL')),
          request,
          params,
        }),
      POST: ({ request, params }) =>
        handleAddRecord({
          db: createDb(getSetting('DATABASE_URL')),
          github: createGithubClient(),
          request,
          params,
        }),
    },
  },
})
