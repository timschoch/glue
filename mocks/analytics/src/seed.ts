import { PostHog } from 'posthog-node'

// Sends a demo funnel through the capture API with posthog-node, so it works
// against a local server and a deploy alike.
const host = process.env.MOCK_ANALYTICS_URL ?? 'http://localhost:4000'
const project = process.env.MOCK_ANALYTICS_PROJECT_KEY ?? 'phc_demo'

const USER_COUNT = 150
const DAY_COUNT = 7
const MILLISECONDS_PER_MINUTE = 60_000
const MILLISECONDS_PER_DAY = 86_400_000
const MAX_STEP_GAP_MINUTES = 120

// Share of users who go on from the step before.
const funnel = [
  { event: 'signed_up', share: 1 },
  { event: 'created_concept', share: 0.6 },
  { event: 'added_decision', share: 0.5 },
  { event: 'invited_teammate', share: 0.3 },
]
const plans = ['free', 'team']

const posthog = new PostHog(project, { host, flushAt: 100 })
const start = Date.now() - DAY_COUNT * MILLISECONDS_PER_DAY
let eventCount = 0

for (let userNumber = 0; userNumber < USER_COUNT; userNumber++) {
  const plan = plans[userNumber % plans.length]
  let timestamp = start + Math.random() * (DAY_COUNT - 1) * MILLISECONDS_PER_DAY
  for (const { event, share } of funnel) {
    if (Math.random() > share) break
    posthog.capture({
      distinctId: `user-${userNumber}`,
      event,
      properties: { plan },
      timestamp: new Date(timestamp),
    })
    eventCount++
    timestamp += Math.random() * MAX_STEP_GAP_MINUTES * MILLISECONDS_PER_MINUTE
  }
}

await posthog.shutdown()
console.log(`Sent ${eventCount} events for project ${project} to ${host}`)
