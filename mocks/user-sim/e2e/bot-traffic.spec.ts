import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { simulate } from '../src/simulate.ts'
import type { Journey } from '../src/journey.ts'

const USERS = 4
const SEED = 1

const journey: Journey = {
  product: 'fixture',
  steps: [
    {
      intent: 'start',
      actions: [{ kind: 'click', role: 'link', name: 'Start' }],
    },
    {
      intent: 'sign up',
      actions: [{ kind: 'click', role: 'button', name: 'Create account' }],
    },
  ],
}

async function serve(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ origin: string; close: () => void }> {
  const server = createServer(handle)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  return {
    origin: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
  }
}

test('a rate limit counts as an error, not as a missing step @smoke', async () => {
  // A 429 goes on the step that sent the request, the text on the step it hides.
  for (const [status, step] of [
    [429, 0],
    [200, 1],
  ]) {
    const product = await serve((request, response) => {
      response.setHeader('content-type', 'text/html')
      if (request.url === '/') {
        response.end('<a href="/sign-up">Start</a>')
        return
      }
      response.statusCode = status
      response.end('<p>Too many requests. Try again later.</p>')
    })
    try {
      const summary = await simulate({
        target: `${product.origin}/`,
        journey,
        users: USERS,
        seed: SEED,
      })
      expect(summary.steps[step]).toMatchObject({ missing: 0, errors: USERS })
    } finally {
      product.close()
    }
  }
})

test('a 429 counts as an error on the step that sent the request @smoke', async () => {
  const product = await serve((request, response) => {
    if (request.method === 'POST') {
      response.statusCode = 429
      response.end()
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end(
      request.url === '/'
        ? '<a href="/sign-up">Start</a>'
        : `<button onclick="fetch('/account', { method: 'POST' }).then(() => {
             document.body.innerHTML = '<a href=&quot;/plan&quot;>Pick a recipe</a>'
           })">Create account</button>`,
    )
  })
  try {
    const summary = await simulate({
      target: `${product.origin}/`,
      journey: {
        ...journey,
        steps: [
          ...journey.steps,
          {
            intent: 'pick a recipe',
            actions: [{ kind: 'click', role: 'link', name: 'Pick a recipe' }],
          },
        ],
      },
      users: USERS,
      seed: SEED,
    })
    expect(summary.steps[1]).toMatchObject({ errors: USERS })
    expect(summary.steps[2]).toMatchObject({ reached: 0, errors: 0 })
  } finally {
    product.close()
  }
})

test('bots send x-glue-bot to the product only, so its cross-origin calls still work @smoke', async () => {
  const productHeaders: Array<string | Array<string> | undefined> = []
  const otherMethods: Array<string | undefined> = []
  // Like an analytics host: it allows any origin, but no extra headers.
  const other = await serve((request, response) => {
    otherMethods.push(request.method)
    response.setHeader('access-control-allow-origin', '*')
    response.end('ok')
  })
  const product = await serve((request, response) => {
    productHeaders.push(request.headers['x-glue-bot'])
    response.setHeader('content-type', 'text/html')
    response.end(
      request.url === '/'
        ? '<a href="/sign-up">Start</a>'
        : `<button>Create account</button>
           <script>fetch('${other.origin}/e', { method: 'POST', body: '{}' })</script>`,
    )
  })
  try {
    const summary = await simulate({
      target: `${product.origin}/`,
      journey,
      users: 1,
      seed: SEED,
    })
    expect(summary.finished).toBe(1)
    expect(productHeaders.length).toBeGreaterThan(0)
    expect(new Set(productHeaders)).toEqual(new Set(['1']))
    // With x-glue-bot on it, the POST would need a preflight that this host
    // fails, and only an OPTIONS would arrive.
    expect(otherMethods).toEqual(['POST'])
  } finally {
    product.close()
    other.close()
  }
})
