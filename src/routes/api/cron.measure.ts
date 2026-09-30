import { createFileRoute } from '@tanstack/react-router'

import { handleMeasureCron } from '../../api/cron-api.ts'
import { createDb } from '../../db/client.ts'
import { measureGoals } from '../../measure/measure-goals.ts'
import { createMetricSource } from '../../measure/metric-source.server.ts'
import { findSetting, getSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/cron/measure')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleMeasureCron({
          request,
          cronSecret: findSetting('CRON_SECRET'),
          measure: () =>
            measureGoals({
              db: createDb(getSetting('DATABASE_URL')),
              source: createMetricSource(),
              now: new Date(),
            }),
        }),
    },
  },
})
