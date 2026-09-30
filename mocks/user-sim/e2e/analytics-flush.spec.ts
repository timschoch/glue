import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { simulate } from '../src/simulate.ts'
import type { Journey } from '../src/journey.ts'

const USERS = 60
const SEED = 1

// Like posthog-js: the page queues its events and sends them with
// sendBeacon when it is hidden, for example when the tab closes.
const BEACON_SCRIPT = `<script>
  const queue = [{ event: 'viewed', path: location.pathname }]
  addEventListener('pagehide', () =>
    navigator.sendBeacon('/capture', JSON.stringify(queue)))
</script>`

function formatPage(path: string): string {
  if (path === '/done') return `<h1>Done</h1>${BEACON_SCRIPT}`
  return `<form action="/done"><button>Accept plan</button></form>${BEACON_SCRIPT}`
}

const journey: Journey = {
  product: 'fixture',
  steps: [
    {
      intent: 'accept a plan',
      actions: [{ kind: 'click', role: 'button', name: 'Accept plan' }],
    },
  ],
}

test('the product sends the events of the last page before the bot closes it @smoke', async () => {
  const events: Array<{ event: string; path: string }> = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture')
    if (url.pathname !== '/capture') {
      response.setHeader('content-type', 'text/html')
      response.end(formatPage(url.pathname))
      return
    }
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString()))
    request.on('end', () => {
      events.push(...(JSON.parse(body) as typeof events))
      response.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`

  try {
    const summary = await simulate({
      target: origin,
      journey,
      users: USERS,
      seed: SEED,
    })

    expect(summary.finished).toBeGreaterThan(0)
    const lastPages = events.filter((event) => event.path === '/done')
    expect(lastPages).toHaveLength(summary.finished)
  } finally {
    server.close()
  }
})
