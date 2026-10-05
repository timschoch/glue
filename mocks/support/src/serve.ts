import { serve } from '@hono/node-server'

import app from './index.ts'

// Local server with the seeded tickets.
const port = Number(process.env.PORT ?? 4002)

serve({ fetch: app.fetch, port }, () => {
  console.log(`mock-support on http://localhost:${port}`)
})
