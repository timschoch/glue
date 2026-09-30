import { getSetting } from '../settings.server.ts'
import { createMockAnalyticsSource } from './mock-analytics.ts'
import type { MetricSource } from './metric-source.ts'

// The metric source Glue measures Goals from, set up from the environment.
export function createMetricSource(): MetricSource {
  return createMockAnalyticsSource({
    url: getSetting('MOCK_ANALYTICS_URL'),
    readKey: getSetting('MOCK_ANALYTICS_READ_KEY'),
  })
}
