import type { Hono } from 'hono'

import { createApp } from './create-app.ts'

// Vercel's Hono entry: it serves this default export. The preset finds the
// entry by its import from 'hono'.
const app: Hono = createApp()

export default app
