import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { simulate } from '../src/simulate.ts'
import type { Journey } from '../src/journey.ts'

const USERS = 8
const SEED = 1
/** A skipped step must not cost the step timeout of 10 s. */
const MAX_RUN_MS = 9_000

const PLANS = '<form action="/done"><button>Accept this plan</button></form>'

// Like flexibeck when no plan fits: first the closest plan, then the plan list.
const FALLBACK = `<p>No plan fits your availability</p>
  <form action="/list"><button>Plan bread ready by Sat 15:55</button></form>`

const journey: Journey = {
  product: 'fixture',
  steps: [
    {
      intent: 'show plans',
      actions: [{ kind: 'click', role: 'button', name: 'Show plans' }],
    },
    {
      intent: 'take the closest plan',
      optional: true,
      actions: [
        { kind: 'click', role: 'button', name: /plan bread ready by/i },
      ],
    },
    {
      intent: 'accept a plan',
      actions: [{ kind: 'click', role: 'button', name: /accept this plan/i }],
    },
  ],
}

test('a bot takes an optional step only when the screen shows it @smoke', async () => {
  const hits = { fallback: 0, done: 0 }
  let plans = 0
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fixture').pathname
    response.setHeader('content-type', 'text/html')
    if (path === '/plans') {
      // Every second visit finds no plan that fits.
      const isFallback = plans++ % 2 === 0
      if (isFallback) hits.fallback++
      response.end(isFallback ? FALLBACK : PLANS)
      return
    }
    if (path === '/list') {
      response.end(PLANS)
      return
    }
    if (path === '/done') {
      hits.done++
      response.end('<h1>Plan accepted</h1>')
      return
    }
    response.end('<form action="/plans"><button>Show plans</button></form>')
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`

  try {
    const startedAt = Date.now()
    const summary = await simulate({
      target: `${origin}/`,
      journey,
      users: USERS,
      seed: SEED,
      concurrency: USERS,
    })
    const [, closest, accept] = summary.steps

    expect(hits.fallback).toBeGreaterThan(0)
    expect(hits.fallback).toBeLessThan(plans)
    expect(closest).toMatchObject({ reached: hits.fallback, missing: 0 })
    expect(accept).toMatchObject({ reached: plans, missing: 0, errors: 0 })
    expect(summary.finished).toBe(hits.done)
    expect(Date.now() - startedAt).toBeLessThan(MAX_RUN_MS)
  } finally {
    server.close()
  }
})
