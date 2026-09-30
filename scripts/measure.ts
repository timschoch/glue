// `pnpm measure [--product <slug>] [--dry-run]`: the measure step. Reads the
// funnel of each Goal with a measure from mock analytics and writes a draft
// Insight when the Goal misses its target or moved (Decision D14).
// Env: DATABASE_URL, MOCK_ANALYTICS_URL, MOCK_ANALYTICS_READ_KEY.
import { createDb } from '../src/db/client.ts'
import { measureGoals } from '../src/measure/measure-goals.ts'
import { createMetricSource } from '../src/measure/metric-source.server.ts'
import { getSetting } from '../src/settings.server.ts'

type MeasureArgs = { productSlug?: string; dryRun: boolean }

export function parseMeasureArgs(args: string[]): MeasureArgs {
  const parsed: MeasureArgs = { dryRun: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--product') {
      index += 1
      if (index >= args.length) throw new Error('"--product" needs a value')
      parsed.productSlug = args[index]
    } else {
      throw new Error(`unknown flag "${arg}"`)
    }
  }
  return parsed
}

async function main() {
  const { productSlug, dryRun } = parseMeasureArgs(process.argv.slice(2))
  const insights = await measureGoals({
    db: createDb(getSetting('DATABASE_URL')),
    source: createMetricSource(),
    now: new Date(),
    productSlug,
    dryRun,
  })
  for (const insight of insights) {
    const id = insight.id ?? 'dry run'
    console.log(`${insight.product} ${id}: ${insight.title}`)
    if (dryRun) console.log(`source: ${insight.source}\n\n${insight.body}\n`)
  }
  if (insights.length === 0) console.log('No new Insights.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
