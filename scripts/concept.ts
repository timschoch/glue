// `pnpm concept`: read and add Glue's Concept records in the database.
// See src/db/concept-fields.ts for the record types and their fields.
import { z } from 'zod'

import { createDb } from '../src/db/client.ts'
import type { ConceptDb } from '../src/db/client.ts'
import {
  addConceptRecord,
  listConceptRecords,
  setAnalyticsProject,
  setDecisionStatus,
  setGoalMeasure,
  setProductRepository,
  showConceptRecord,
} from '../src/db/concept-records.ts'
import type { ConceptFields, ConceptFolder } from '../src/db/concept-records.ts'
import { CONCEPT_FIELDS } from '../src/db/concept-fields.ts'
import { goalMeasureSchema } from '../src/db/goal-measure.ts'
import type { GoalMeasure } from '../src/db/goal-measure.ts'
import type { DecisionStatus } from '../src/db/schema.ts'
import { createToken, deleteToken, listTokens } from '../src/db/tokens.ts'
import { createGithubClient } from '../src/github/client.ts'
import { createDownstreamIssue } from '../src/github/downstream-issue.ts'
import type { DownstreamIssue } from '../src/github/downstream-issue.ts'

const FLAG_TO_FIELD: Record<string, string> = {
  'analytics-project': 'analytics_project',
  'enforced-by': 'enforced_by',
  'superseded-by': 'superseded_by',
}

const KNOWN_FIELDS = new Set(
  Object.values(CONCEPT_FIELDS)
    .flatMap((type) => type.required as readonly string[])
    .filter((field) => field !== 'id')
    .concat([
      'product',
      'body',
      'status',
      'superseded_by',
      'supersedes',
      'name',
      'measure',
      'analytics_project',
      'repository',
    ]),
)

function parseMeasure(value: string): GoalMeasure {
  let json: unknown
  try {
    json = JSON.parse(value)
  } catch {
    throw new Error('"--measure" must be JSON')
  }
  const result = goalMeasureSchema.safeParse(json)
  if (!result.success) {
    throw new Error(`"--measure": ${z.prettifyError(result.error)}`)
  }
  return result.data
}

function parseFlagValue(key: string, value: string) {
  if (key === 'evidence') return value.split(',')
  if (key === 'measure') return parseMeasure(value)
  return value
}

function isConceptFolder(value: string | undefined): value is ConceptFolder {
  return value !== undefined && value in CONCEPT_FIELDS
}

export function parseFlags(args: string[]): ConceptFields {
  const flags: ConceptFields = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) continue
    const flagName = arg.slice(2)
    const key = FLAG_TO_FIELD[flagName] ?? flagName
    if (!KNOWN_FIELDS.has(key)) {
      throw new Error(`unknown flag "--${flagName}"`)
    }
    if (index + 1 >= args.length) {
      throw new Error(`"--${flagName}" needs a value`)
    }
    const value = args[index + 1]
    index += 1
    flags[key] = parseFlagValue(key, value)
  }
  return flags
}

export function formatDownstreamIssue(
  product: string,
  decisionId: string,
  issue: DownstreamIssue,
): string {
  switch (issue.kind) {
    case 'created':
    case 'existing':
      return `issue: ${issue.url}`
    case 'not-accepted':
      return `no issue: ${decisionId} is not accepted`
    case 'no-repository':
      return 'no issue: the Product has no repository'
    case 'not-found':
      return `no issue: decision "${decisionId}" not found`
    case 'failed':
      return `issue missing: ${issue.message}\nRetry: pnpm concept downstream ${decisionId} --product ${product}`
  }
}

// An accepted Decision opens its issue downstream. A GitHub failure keeps
// the Decision change and only reports the missing issue.
async function handleDownstreamIssue(
  db: ConceptDb,
  product: string,
  decisionId: string,
) {
  const issue = await createDownstreamIssue(
    db,
    createGithubClient(),
    product,
    decisionId,
  )
  console.error(formatDownstreamIssue(product, decisionId, issue))
  return issue
}

async function collectStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}

function printRecord(record: Awaited<ReturnType<typeof showConceptRecord>>) {
  console.log(record.id)
  for (const [key, value] of Object.entries(record.fields)) {
    console.log(`${key}: ${value}`)
  }
  if (record.goal) console.log(`goal: ${record.goal.id} ${record.goal.title}`)
  for (const item of record.evidence ?? []) {
    console.log(`evidence: ${item.id} ${item.title}`)
  }
  if (record.supersededBy) console.log(`superseded_by: ${record.supersededBy}`)
  for (const id of record.supersedes ?? []) console.log(`supersedes: ${id}`)
  if (record.body) console.log(`\n${record.body}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const db = createDb(databaseUrl)

  switch (command) {
    case 'list': {
      const [maybeFolder, ...flagArgs] = rest
      const folder = isConceptFolder(maybeFolder) ? maybeFolder : undefined
      const flags = parseFlags(folder ? flagArgs : rest)
      const product = (flags.product as string | undefined) ?? 'glue'
      const rows = await listConceptRecords(db, product, folder)
      for (const row of rows) {
        console.log([row.id, row.status, row.title].filter(Boolean).join('  '))
      }
      return
    }
    case 'show': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.product as string | undefined) ?? 'glue'
      printRecord(await showConceptRecord(db, product, id))
      return
    }
    case 'add': {
      const [folder, ...flagArgs] = rest
      if (!isConceptFolder(folder)) {
        throw new Error(`"${folder}" is not a Concept type`)
      }
      const flags = parseFlags(flagArgs)
      const product = (flags.product as string | undefined) ?? 'glue'
      const bodyFlag = flags.body as string | undefined
      const body = bodyFlag === '-' ? await collectStdin() : (bodyFlag ?? '')
      delete flags.product
      delete flags.body
      const id = await addConceptRecord(db, product, folder, flags, body)
      console.log(id)
      if (folder === 'decisions') await handleDownstreamIssue(db, product, id)
      return
    }
    case 'set': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.product as string | undefined) ?? 'glue'
      if (id.startsWith('G')) {
        if (!flags.measure) throw new Error('set G<n> needs --measure')
        await setGoalMeasure(db, product, id, flags.measure as GoalMeasure)
        return
      }
      await setDecisionStatus(
        db,
        product,
        id,
        flags.status as DecisionStatus,
        flags.superseded_by as string | undefined,
      )
      await handleDownstreamIssue(db, product, id)
      return
    }
    case 'downstream': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.product as string | undefined) ?? 'glue'
      const issue = await handleDownstreamIssue(db, product, id)
      if (issue.kind === 'failed') process.exitCode = 1
      return
    }
    case 'product':
      await handleProductCommand(db, rest)
      return
    case 'token':
      await handleTokenCommand(db, rest)
      return
    default:
      throw new Error(`unknown command "${command}"`)
  }
}

// `product set <slug> --analytics-project <key> --repository owner/name`:
// the analytics project the Product's Goals are measured from (an empty key
// removes it) and the GitHub repository that builds the Product.
async function handleProductCommand(
  db: ConceptDb,
  [command, slug, ...rest]: string[],
) {
  if (command !== 'set') {
    throw new Error(`unknown product command "${command}"`)
  }
  const flags = parseFlags(rest)
  const analyticsProject = flags.analytics_project as string | undefined
  const repository = flags.repository as string | undefined
  if (!slug || (analyticsProject === undefined && !repository)) {
    throw new Error(
      'product set needs <slug> and --analytics-project or --repository owner/name',
    )
  }
  if (analyticsProject !== undefined) {
    await setAnalyticsProject(db, slug, analyticsProject || null)
  }
  if (repository) await setProductRepository(db, slug, repository)
}

// Tokens for the Concept HTTP API, one Product each.
async function handleTokenCommand(db: ConceptDb, [command, ...rest]: string[]) {
  switch (command) {
    case 'create': {
      const flags = parseFlags(rest)
      const product = flags.product as string | undefined
      const name = flags.name as string | undefined
      if (!product || !name) {
        throw new Error('token create needs --product and --name')
      }
      const { token } = await createToken(db, product, name)
      console.log(token)
      console.error('Copy the token now. Glue stores only its hash.')
      return
    }
    case 'list':
      for (const token of await listTokens(db)) {
        const created = token.createdAt.toISOString().slice(0, 10)
        console.log([token.id, token.product, token.name, created].join('  '))
      }
      return
    case 'revoke': {
      const [id] = rest
      const deleted = /^\d+$/.test(id) && (await deleteToken(db, Number(id)))
      if (!deleted) {
        throw new Error(`token "${id}" not found`)
      }
      return
    }
    default:
      throw new Error(`unknown token command "${command}"`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
