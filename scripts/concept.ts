// `pnpm concept`: read and add Glue's Concept records in the database.
// See src/db/concept-fields.ts for the record types and their fields.
import { z } from 'zod'

import { createDb } from '../src/db/client.ts'
import type { ConceptDb } from '../src/db/client.ts'
import {
  addConceptRecord,
  addDecision,
  listConceptRecords,
  setAnalyticsProject,
  setProductRepository,
  setSocialHandle,
  showConceptRecord,
  updateDecision,
  updateGoal,
} from '../src/db/concept-records.ts'
import type { ConceptFields, ConceptFolder } from '../src/db/concept-records.ts'
import { CONCEPT_FIELDS } from '../src/db/concept-fields.ts'
import type { DecisionStatus, GoalStatus } from '../src/db/concept-fields.ts'
import { goalMeasureSchema } from '../src/db/goal-measure.ts'
import type { GoalMeasure } from '../src/db/goal-measure.ts'
import { createToken, deleteToken, listTokens } from '../src/db/tokens.ts'
import { createGithubClient } from '../src/github/client.ts'
import type { GithubClient } from '../src/github/client.ts'
import { createDownstreamIssue } from '../src/github/downstream-issue.ts'
import type { DownstreamIssue } from '../src/github/downstream-issue.ts'

const FLAG_TO_FIELD: Record<string, string> = {
  'analytics-project': 'analytics_project',
  'social-handle': 'social_handle',
  'enforced-by': 'enforced_by',
  'superseded-by': 'superseded_by',
}

const KNOWN_FIELDS = new Set(
  Object.values(CONCEPT_FIELDS)
    .flatMap((type) => type.required as readonly string[])
    .filter((field) => field !== 'id')
    .concat([
      'project',
      'body',
      'status',
      'superseded_by',
      'supersedes',
      'name',
      'measure',
      'analytics_project',
      'repository',
      'social_handle',
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
    if (flagName === 'product') {
      throw new Error('"--product" is gone: use "--project"')
    }
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
      return `issue missing: ${issue.message}\nRetry: pnpm concept downstream ${decisionId} --project ${product}`
  }
}

async function collectStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}

function formatFieldValue(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

function printRecord(record: Awaited<ReturnType<typeof showConceptRecord>>) {
  console.log(record.id)
  for (const [key, value] of Object.entries(record.fields)) {
    console.log(`${key}: ${formatFieldValue(value)}`)
  }
  if (record.goal) console.log(`goal: ${record.goal.id} ${record.goal.title}`)
  for (const item of record.evidence ?? []) {
    console.log(`evidence: ${item.id} ${item.title}`)
  }
  if (record.supersededBy) console.log(`superseded_by: ${record.supersededBy}`)
  for (const id of record.supersedes ?? []) console.log(`supersedes: ${id}`)
  if (record.body) console.log(`\n${record.body}`)
}

const FIELD_TO_FLAG = Object.fromEntries(
  Object.entries(FLAG_TO_FIELD).map(([flag, field]) => [field, flag]),
)

function formatHelp() {
  const types = Object.entries(CONCEPT_FIELDS).map(([folder, { required }]) => {
    const flags = required
      .filter((field) => field !== 'id')
      .map((field) => `--${FIELD_TO_FLAG[field] ?? field}`)
    return `  ${folder}: ${flags.join(' ')}`
  })
  return [
    'pnpm concept list [<type>]',
    'pnpm concept show <id>',
    'pnpm concept add <type> <flags of the type> [--body <text>, or - for stdin]',
    'pnpm concept set <id> [--status <status>] [--superseded-by <id>] [--measure <json>]',
    'pnpm concept downstream <id>',
    'pnpm concept project set <slug> [--analytics-project <key>] [--repository <owner/name>] [--social-handle <handle>]',
    'pnpm concept token create --project <slug> --name <name>',
    'pnpm concept token list',
    'pnpm concept token revoke <id>',
    '',
    'list, show, add, set and downstream take --project <slug>. The default is glue.',
    '',
    'Types, and the flags that add needs:',
    ...types,
    '  goals also take --measure <json>, decisions --supersedes <id>',
    '  --evidence takes ids with commas between them: I1,I2',
  ].join('\n')
}

// No command, or `--help` at any place, prints the commands. It needs no
// database.
export async function main(args: string[], databaseUrl: string | undefined) {
  if (args.length === 0 || args.includes('--help')) {
    console.log(formatHelp())
    return
  }
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  await runConcept(createDb(databaseUrl), createGithubClient, args)
}

// One command of `pnpm concept`. A write that leaves a Decision accepted
// opens its issue downstream. A GitHub failure keeps the write, and the
// command says that the issue is missing.
export async function runConcept(
  db: ConceptDb,
  getGithub: () => GithubClient,
  [command, ...rest]: string[],
) {
  switch (command) {
    case 'list': {
      const [maybeFolder, ...flagArgs] = rest
      const folder = isConceptFolder(maybeFolder) ? maybeFolder : undefined
      const flags = parseFlags(folder ? flagArgs : rest)
      const product = (flags.project as string | undefined) ?? 'glue'
      const rows = await listConceptRecords(db, product, folder)
      for (const row of rows) {
        console.log([row.id, row.status, row.title].filter(Boolean).join('  '))
      }
      return
    }
    case 'show': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      printRecord(await showConceptRecord(db, product, id))
      return
    }
    case 'add': {
      const [folder, ...flagArgs] = rest
      if (!isConceptFolder(folder)) {
        throw new Error(`"${folder}" is not a Concept type`)
      }
      const flags = parseFlags(flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      const bodyFlag = flags.body as string | undefined
      const body = bodyFlag === '-' ? await collectStdin() : (bodyFlag ?? '')
      delete flags.project
      delete flags.body
      if (folder !== 'decisions') {
        console.log(await addConceptRecord(db, product, folder, flags, body))
        return
      }
      const { id, issue } = await addDecision(
        db,
        getGithub(),
        product,
        flags,
        body,
      )
      console.log(id)
      console.error(formatDownstreamIssue(product, id, issue))
      return
    }
    case 'set': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      if (id.startsWith('G')) {
        await updateGoal(db, product, id, {
          measure: flags.measure as GoalMeasure | undefined,
          status: flags.status as GoalStatus | undefined,
        })
        return
      }
      const { issue } = await updateDecision(
        db,
        getGithub(),
        product,
        id,
        flags.status as DecisionStatus,
        flags.superseded_by as string | undefined,
      )
      console.error(formatDownstreamIssue(product, id, issue))
      return
    }
    case 'downstream': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      const issue = await createDownstreamIssue(db, getGithub(), product, id)
      console.error(formatDownstreamIssue(product, id, issue))
      if (issue.kind === 'failed') process.exitCode = 1
      return
    }
    case 'project':
      await handleProjectCommand(db, rest)
      return
    case 'product':
      throw new Error('"product" is gone: use "pnpm concept project set"')
    case 'token':
      await handleTokenCommand(db, rest)
      return
    default:
      throw new Error(`unknown command "${command}". See pnpm concept --help`)
  }
}

// `project set <slug> --analytics-project <key> --repository owner/name
// --social-handle <handle>`: the analytics project the Product's Goals are
// measured from, the GitHub repository that builds the Product, and its
// handle in the social channel. An empty key or handle removes it.
async function handleProjectCommand(
  db: ConceptDb,
  [command, slug, ...rest]: string[],
) {
  if (command !== 'set') {
    throw new Error(`unknown project command "${command}"`)
  }
  const flags = parseFlags(rest)
  const analyticsProject = flags.analytics_project as string | undefined
  const repository = flags.repository as string | undefined
  const socialHandle = flags.social_handle as string | undefined
  if (
    !slug ||
    (analyticsProject === undefined &&
      !repository &&
      socialHandle === undefined)
  ) {
    throw new Error(
      'project set needs <slug> and --analytics-project, --repository owner/name or --social-handle',
    )
  }
  if (analyticsProject !== undefined) {
    await setAnalyticsProject(db, slug, analyticsProject || null)
  }
  if (repository) await setProductRepository(db, slug, repository)
  if (socialHandle !== undefined) {
    await setSocialHandle(db, slug, socialHandle || null)
  }
}

// Tokens for the Concept HTTP API, one Product each.
async function handleTokenCommand(db: ConceptDb, [command, ...rest]: string[]) {
  switch (command) {
    case 'create': {
      const flags = parseFlags(rest)
      const product = flags.project as string | undefined
      const name = flags.name as string | undefined
      if (!product || !name) {
        throw new Error('token create needs --project and --name')
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
  main(process.argv.slice(2), process.env.DATABASE_URL).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
