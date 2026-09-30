import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { simulate } from '../src/simulate.ts'
import type { Journey } from '../src/journey.ts'

const USERS = 100
const SEED = 1
const CONCURRENCY = 8
/** Three runs of 100 bots each. */
const TIMEOUT_MS = 120_000

/** Step 1 shows `choices` plan modes, step 2 a plan to accept. */
function formatPage(url: URL): string {
  if (url.pathname === '/plan') {
    return '<h1>Your plan</h1><button>Accept plan</button>'
  }
  const choices = Number(url.searchParams.get('choices'))
  const radios = Array.from(
    { length: choices },
    (_, index) =>
      `<label><input type="radio" name="mode"> Mode ${index + 1}</label>`,
  ).join('')
  return `<h1>Pick a plan mode</h1>
    <form action="/plan">
      <fieldset role="radiogroup"><legend>Plan mode</legend>${radios}</fieldset>
      <button>Continue</button>
    </form>`
}

const journey: Journey = {
  product: 'fixture',
  steps: [
    {
      intent: 'pick a plan mode',
      actions: [
        { kind: 'choose' },
        { kind: 'click', role: 'button', name: 'Continue' },
      ],
    },
    {
      intent: 'accept a plan',
      actions: [{ kind: 'click', role: 'button', name: 'Accept plan' }],
    },
  ],
}

test('a step with 12 choices loses more bots than one with 3', async () => {
  test.setTimeout(TIMEOUT_MS)
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(formatPage(new URL(request.url ?? '/', 'http://fixture')))
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`

  try {
    const run = (choices: number) =>
      simulate({
        target: `${origin}/?choices=${choices}`,
        journey,
        users: USERS,
        seed: SEED,
        concurrency: CONCURRENCY,
      })
    const few = await run(3)
    const many = await run(12)
    console.log(JSON.stringify({ few, many }, null, 2))

    const [fewPick, fewAccept] = few.steps
    const [manyPick, manyAccept] = many.steps
    expect(fewPick.reached).toBe(USERS)
    expect(manyPick.reached).toBe(USERS)
    expect(manyAccept.reached).toBeLessThan(fewAccept.reached)
    expect(await run(12)).toEqual(many)
  } finally {
    server.close()
  }
})
