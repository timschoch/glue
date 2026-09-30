import { parseArgs } from 'node:util'
import { formatSummary } from './format-summary.ts'
import { flexibeck } from './journeys/flexibeck.ts'
import type { Journey } from './journey.ts'
import { simulate } from './simulate.ts'

const journeys: Partial<Record<string, Journey>> = { flexibeck }

const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    journey: { type: 'string' },
    users: { type: 'string' },
    seed: { type: 'string' },
    concurrency: { type: 'string' },
  },
})

const journey = journeys[values.journey ?? '']
const users = Number(values.users)
const seed = Number(values.seed)
const concurrency =
  values.concurrency === undefined ? undefined : Number(values.concurrency)

if (
  !values.target ||
  !journey ||
  !Number.isInteger(users) ||
  users < 1 ||
  !Number.isInteger(seed) ||
  (concurrency !== undefined &&
    !(Number.isInteger(concurrency) && concurrency > 0))
) {
  console.error(
    `Usage: pnpm --filter user-sim simulate --target <url> --journey <${Object.keys(journeys).join('|')}> --users <n> --seed <s> [--concurrency <c>]`,
  )
  process.exit(1)
}

const summary = await simulate({
  target: values.target,
  journey,
  users,
  seed,
  concurrency,
})
console.log(formatSummary(summary))
