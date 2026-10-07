import { serve } from '@hono/node-server'

import app from './index.ts'

// Local server with the seeded findings.
const port = Number(process.env.PORT ?? 4003)

serve({ fetch: app.fetch, port }, () => {
  console.log(`mock-market on http://localhost:${port}`)
})
