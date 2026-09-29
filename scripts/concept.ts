// `pnpm concept`: read and add Glue's Concept records in the database.
// See src/db/concept-fields.ts for the record types and their fields.
import { createDb } from '../src/db/client.ts'
import {
  addConceptRecord,
  listConceptRecords,
  setDecisionStatus,
  showConceptRecord,
} from '../src/db/concept-cli.ts'
import type { ConceptFields, ConceptFolder } from '../src/db/concept-cli.ts'
import { CONCEPT_FIELDS } from '../src/db/concept-fields.ts'
import type { DecisionStatus } from '../src/db/schema.ts'

const FLAG_TO_FIELD: Record<string, string> = {
  'enforced-by': 'enforced_by',
  'superseded-by': 'superseded_by',
}

const KNOWN_FIELDS = new Set(
  Object.values(CONCEPT_FIELDS)
    .flatMap((type) => type.required as readonly string[])
    .filter((field) => field !== 'id')
    .concat(['product', 'body', 'status', 'superseded_by']),
)

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
    flags[key] = key === 'evidence' ? value.split(',') : value
  }
  return flags
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
      return
    }
    case 'set': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.product as string | undefined) ?? 'glue'
      await setDecisionStatus(
        db,
        product,
        id,
        flags.status as DecisionStatus,
        flags.superseded_by as string | undefined,
      )
      return
    }
    default:
      throw new Error(`unknown command "${command}"`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
