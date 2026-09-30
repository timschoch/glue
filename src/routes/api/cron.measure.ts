import { createFileRoute } from '@tanstack/react-router'

import { handleMeasureCron } from '../../api/cron-api.ts'
import { createDb } from '../../db/client.ts'
import { measureGoals } from '../../measure/measure-goals.ts'
import { createMetricSource } from '../../measure/metric-source.server.ts'
import { measureSocialComments } from '../../measure/social-channel.server.ts'
import { findSetting, getSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/cron/measure')({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleMeasureCron({
          request,
          cronSecret: findSetting('CRON_SECRET'),
          measure: async () => {
            const db = createDb(getSetting('DATABASE_URL'))
            const now = new Date()
            const goals = await measureGoals({
              db,
              source: createMetricSource(),
              now,
            })
            const comments = await measureSocialComments({ db, now })
            return { ...goals, comments: comments ?? [] }
          },
        }),
    },
  },
})
