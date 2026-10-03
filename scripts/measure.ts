// `pnpm measure [--project <slug>] [--dry-run]`: the measure step. Reads the
// funnel of each Goal with a measure from mock analytics and writes a draft
// Insight when the Goal misses its target or moved (Decision D14). Reads the
// new comments of each Product with a social handle from mock social and
// writes one draft Insight with their sentiment (Decision D22).
// Env: DATABASE_URL, MOCK_ANALYTICS_URL, MOCK_ANALYTICS_READ_KEY, and for
// comments MOCK_SOCIAL_URL, MOCK_SOCIAL_READ_KEY, HF_TOKEN.
import { createDb } from '../src/db/client.ts'
import { measureGoals } from '../src/measure/measure-goals.ts'
import { createMetricSource } from '../src/measure/metric-source.server.ts'
import { measureSocialComments } from '../src/measure/social-channel.server.ts'
import { getSetting } from '../src/settings.server.ts'

type MeasureArgs = { productSlug?: string; dryRun: boolean }

export function parseMeasureArgs(args: string[]): MeasureArgs {
  const parsed: MeasureArgs = { dryRun: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--project') {
      index += 1
      if (index >= args.length) throw new Error('"--project" needs a value')
      parsed.productSlug = args[index]
    } else if (arg === '--product') {
      throw new Error('"--product" is gone: use "--project"')
    } else {
      throw new Error(`unknown flag "${arg}"`)
    }
  }
  return parsed
}

async function main() {
  const { productSlug, dryRun } = parseMeasureArgs(process.argv.slice(2))
  const db = createDb(getSetting('DATABASE_URL'))
  const now = new Date()
  const { insights, skipped } = await measureGoals({
    db,
    source: createMetricSource(),
    now,
    productSlug,
    dryRun,
  })
  for (const goal of skipped) {
    console.error(`${goal.product} ${goal.goal} skipped: ${goal.reason}`)
  }
  const comments = await measureSocialComments({
    db,
    now,
    productSlug,
    dryRun,
  })
  if (!comments) {
    console.error('Comments skipped: MOCK_SOCIAL_URL is not set.')
  }
  for (const product of comments?.skipped ?? []) {
    console.error(`${product.product} comments skipped: ${product.reason}`)
  }
  const commentInsights = comments?.insights ?? []
  for (const insight of [...insights, ...commentInsights]) {
    const id = insight.id ?? 'dry run'
    console.log(`${insight.product} ${id}: ${insight.title}`)
    if (dryRun) console.log(`source: ${insight.source}\n\n${insight.body}\n`)
  }
  if (insights.length === 0 && commentInsights.length === 0) {
    console.log('No new Insights.')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
