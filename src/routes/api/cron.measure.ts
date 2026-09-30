import { createFileRoute } from '@tanstack/react-router'

import { handleMeasureCron } from '../../api/cron-api.ts'
import { createDb } from '../../db/client.ts'
import { createMetricSource } from '../../measure/metric-source.server.ts'
import { getSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/cron/measure')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleMeasureCron({
          db: createDb(getSetting('DATABASE_URL')),
          request,
          source: createMetricSource(),
          cronSecret: getSetting('CRON_SECRET'),
        }),
    },
  },
})
