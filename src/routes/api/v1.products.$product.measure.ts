import { createFileRoute } from '@tanstack/react-router'

import { handleMeasureProduct } from '../../api/concept-api.ts'
import { createDb } from '../../db/client.ts'
import { createMetricSource } from '../../measure/metric-source.server.ts'
import { getSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/v1/products/$product/measure')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handleMeasureProduct({
          db: createDb(getSetting('DATABASE_URL')),
          request,
          params,
          source: createMetricSource(),
        }),
    },
  },
})
