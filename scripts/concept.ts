// `pnpm concept`: read and add Glue's Concept records in the database.
// See src/db/concept-fields.ts for the record types and their fields.
import { z } from 'zod'

import { createDb } from '../src/db/client.ts'
import type { ConceptDb } from '../src/db/client.ts'
import {
  addConceptRecord,
  addDecision,
  setAnalyticsProject,
  setProductRepository,
  setSocialHandle,
  updateDecision,
} from '../src/db/concept-records.ts'
import type { ConceptFields, ConceptFolder } from '../src/db/concept-records.ts'
import { listBuilds } from '../src/db/builds.ts'
import { CONCEPT_FIELDS } from '../src/db/concept-fields.ts'
import type { DecisionStatus } from '../src/db/concept-fields.ts'
import { findContract, signContract } from '../src/db/contracts.ts'
import type { FrozenPart } from '../src/db/contracts.ts'
import { goalMeasureSchema } from '../src/db/goal-measure.ts'
import type { GoalMeasure } from '../src/db/goal-measure.ts'
import type { Kind } from '../src/db/kinds.ts'
import {
  listConceptRecords,
  showConceptRecord,
} from '../src/db/legacy-records.ts'
import {
  addMember,
  assign,
  assignmentRoles,
  listAssignments,
  listMembers,
} from '../src/db/members.ts'
import { createPartOperations } from '../src/db/part-operations.ts'
import {
  addConcept,
  addJoint,
  addPart,
  addProject,
  parseNewPart,
  parsePartAnswer,
  parsePartChange,
  parseQuestionAnswer,
  removeJoint,
  updatePart,
} from '../src/db/part-records.ts'
import {
  evidenceLevels,
  findPart,
  listMine,
  listParts,
} from '../src/db/parts.ts'
import type { Part, PartSummary, PartType } from '../src/db/parts.ts'
import { answers } from '../src/db/part-trust.ts'
import { typeOfRecordId } from '../src/db/record-id.ts'
import { createToken, deleteToken, listTokens } from '../src/db/tokens.ts'
import { createGithubClient } from '../src/github/client.ts'
import type { GithubClient } from '../src/github/client.ts'
import { createDownstreamIssue } from '../src/github/downstream-issue.ts'
import type { DownstreamIssue } from '../src/github/downstream-issue.ts'
import { addSignalInsight, listSignals } from '../src/db/signals.ts'

const FLAG_TO_FIELD: Record<string, string> = {
  'analytics-project': 'analytics_project',
  'social-handle': 'social_handle',
  'enforced-by': 'enforced_by',
  'superseded-by': 'superseded_by',
  'waits-on': 'waits_on',
  'co-author': 'co_author',
  level: 'evidence_level',
}

// The fields that a Part names in another way than the flags do.
const FIELD_TO_PART_KEY: Record<string, string> = {
  enforced_by: 'enforcedBy',
  evidence_level: 'evidenceLevel',
}

// The Part types without a record shape of today. `list`, `show` and `add`
// read and write them as Parts.
const PART_FOLDERS = {
  entities: 'entity',
  flows: 'flow',
  metrics: 'metric',
} as const

type PartFolder = keyof typeof PART_FOLDERS

const PART_TYPES: readonly PartType[] = Object.values(PART_FOLDERS)

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
      'evidence_level',
      'needs',
      'concept',
      'kind',
      'parent',
      'name',
      'measure',
      'analytics_project',
      'repository',
      'social_handle',
      'waits_on',
      'words',
      'by',
      'version',
      'member',
      'responsible',
      'co_author',
      'option',
      'pick',
      'text',
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
  if (key === 'evidence' || key === 'needs') return value.split(',')
  if (key === 'measure') return parseMeasure(value)
  return value
}

function isConceptFolder(value: string | undefined): value is ConceptFolder {
  return value !== undefined && value in CONCEPT_FIELDS
}

function isPartFolder(value: string | undefined): value is PartFolder {
  return value !== undefined && value in PART_FOLDERS
}

// The flags as the fields of a Part.
function toPartInput(flags: ConceptFields) {
  return Object.fromEntries(
    Object.entries(flags).map(([field, value]) => [
      FIELD_TO_PART_KEY[field] ?? field,
      value,
    ]),
  )
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
    // `--option` repeats: one flag per option, in their order.
    flags[key] =
      key === 'option'
        ? [...((flags.option as string[] | undefined) ?? []), value]
        : parseFlagValue(key, value)
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

// The body of the flags. `-` reads it from stdin.
async function readBody(flags: ConceptFields): Promise<string | undefined> {
  const body = flags.body as string | undefined
  return body === '-' ? collectStdin() : body
}

function formatFieldValue(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

// One line of `list` and of `mine`.
function formatRow({
  id,
  status,
  trust,
  workState,
  title,
}: Pick<PartSummary, 'id' | 'status' | 'title'> &
  Partial<Pick<PartSummary, 'trust' | 'workState'>>) {
  return [id, status, trust, workState, title].filter(Boolean).join('  ')
}

// The Trust and the Work state of the Part, its open flags and the Part
// that it waits on.
function printTrust(part: Part) {
  console.log(`trust: ${part.trust}`)
  console.log(`work_state: ${part.workState}`)
  if (part.measure) {
    const { target, latestValue, onTarget, measuredAt } = part.measure
    if (target !== null) console.log(`target: ${target}`)
    if (latestValue !== null) console.log(`value: ${latestValue}`)
    if (onTarget !== null) console.log(`on_target: ${onTarget}`)
    if (measuredAt) console.log(`measured_at: ${measuredAt}`)
  }
  for (const { cause, reason, createdAt } of part.flags) {
    const date = createdAt.slice(0, 10)
    console.log(`flag: ${cause.id} ${reason} ${date} ${cause.title}`)
  }
  if (part.waitsOn) {
    console.log(`waits_on: ${part.waitsOn.id} ${part.waitsOn.title}`)
  }
  for (const entry of part.activity) {
    const flag = 'cause' in entry ? ` ${entry.cause.id} ${entry.reason}` : ''
    console.log(`activity: ${entry.at} ${entry.kind}${flag}`)
  }
}

// The options of a Decision with the pick of its author, and the answer
// that it got. A superseded Decision that was never accepted was not chosen.
function printQuestion({ question, unchosen }: Part) {
  question?.options.forEach((option, index) => {
    const pick = question.pick === index + 1 ? ' (pick)' : ''
    console.log(`option: ${index + 1} ${option}${pick}`)
  })
  const answer = question?.answer
  if (answer) {
    const given =
      answer.option === null ? answer.text : `option ${answer.option}`
    console.log(`answer: ${given}, ${answer.by}, ${answer.at.slice(0, 10)}`)
  }
  if (unchosen) console.log('outcome: not chosen')
}

function printRecord(
  record: Awaited<ReturnType<typeof showConceptRecord>>,
  part: Part | undefined,
) {
  console.log(record.id)
  for (const [key, value] of Object.entries(record.fields)) {
    console.log(`${key}: ${formatFieldValue(value)}`)
  }
  if (record.goal) console.log(`goal: ${record.goal.id} ${record.goal.title}`)
  for (const item of record.evidence ?? []) {
    console.log(`evidence: ${item.id} ${item.title}`)
  }
  for (const item of record.needs ?? []) {
    console.log(`needs: ${item.id} ${item.title}`)
  }
  if (record.supersededBy) console.log(`superseded_by: ${record.supersededBy}`)
  for (const id of record.supersedes ?? []) console.log(`supersedes: ${id}`)
  if (part) {
    printQuestion(part)
    printTrust(part)
  }
  if (record.body) console.log(`\n${record.body}`)
}

// An Entity, a Flow or a Metric: the fields that it has, its home Concept
// and the Parts that it needs.
function printPart(part: Part) {
  console.log(part.id)
  console.log(`title: ${part.title}`)
  if (part.owner) console.log(`owner: ${part.owner}`)
  if (part.source) console.log(`source: ${part.source}`)
  if (part.measure) {
    console.log(`measure: ${JSON.stringify(part.measure.measure)}`)
  }
  console.log(`concept: ${part.concept}`)
  for (const { part: needed } of part.needs) {
    console.log(`needs: ${needed.id} ${needed.title}`)
  }
  printTrust(part)
  if (part.body) console.log(`\n${part.body}`)
}

const FIELD_TO_FLAG = Object.fromEntries(
  Object.entries(FLAG_TO_FIELD).map(([flag, field]) => [field, flag]),
)

function formatHelp() {
  // Fact is no longer a type (D26), so `add` does not take it.
  const types = Object.entries(CONCEPT_FIELDS)
    .filter(([, { type }]) => type !== null)
    .map(([folder, { required }]) => {
      const flags = required
        .filter((field) => field !== 'id')
        .map((field) => `--${FIELD_TO_FLAG[field] ?? field}`)
      return `  ${folder}: ${flags.join(' ')}`
    })
  return [
    'pnpm concept list [<type>]',
    'pnpm concept show <id>',
    'pnpm concept add <type> <flags of the type> [--body <text>, or - for stdin]',
    'pnpm concept set <id> <flags of the type>',
    'pnpm concept downstream <id>',
    'pnpm concept answer <id> <answer> [--waits-on <id>] [--words <text> --by <name>]',
    'pnpm concept answer <id> --option <number> --by <name>',
    'pnpm concept answer <id> --text <answer> --by <name>',
    'pnpm concept signals',
    'pnpm concept signals insight <address> [<address> ...] --title <title> [--concept <slug>] [--body <text>]',
    'pnpm concept builds',
    'pnpm concept mine [--member <e-mail>]',
    'pnpm concept member add <e-mail>',
    'pnpm concept member list',
    'pnpm concept assign <id or Concept slug> --responsible <e-mail>',
    'pnpm concept assign <id or Concept slug> --co-author <e-mail>',
    'pnpm concept concept add <slug> --title <title> [--kind <kind>] [--parent <slug>]',
    'pnpm concept contract show <concept> [--version <number>]',
    'pnpm concept contract sign <concept> --owner <name>',
    'pnpm concept joint add <id> <needed id> [--two-way]',
    'pnpm concept joint remove <id> <needed id>',
    'pnpm concept project add <slug>',
    'pnpm concept project set <slug> [--analytics-project <key>] [--repository <owner/name>] [--social-handle <handle>]',
    'pnpm concept token create --project <slug> --name <name>',
    'pnpm concept token list',
    'pnpm concept token revoke <id>',
    '',
    'list, show, add, set, downstream, answer, mine, signals, builds, member, assign, concept, contract and joint take --project <slug>. The default is glue.',
    '',
    'Types, and the flags that add needs:',
    ...types,
    `  ${Object.keys(PART_FOLDERS).join(', ')}: --title`,
    '  goals and metrics also take --measure <json>, decisions --supersedes <id>',
    '  decisions also take --option <text>, once per option, and --pick <number>: the option that the author would take',
    `  insights also take --level ${evidenceLevels.join('|')} and --status draft`,
    '  guardrails, entities, flows and metrics also take --source',
    '  entities, flows and metrics also take --owner',
    '  each type takes --concept <slug>: its home Concept. The default is the root.',
    '  decisions, entities, flows and metrics take --needs: the records that it needs',
    '  --evidence and --needs take ids with commas between them: I1,I2',
    '',
    'set on a Decision takes --status and --superseded-by.',
    'On each other type it takes the flags of the type.',
    'An empty value clears the field: --status "".',
    '',
    `answer takes ${answers.join(', ')}. The Work state of the record says which ones.`,
    'wait needs --waits-on: the record that it waits on.',
    '--words is an answer in words: it goes to the end of the body with the name of --by and the date.',
    'answer with --option or --text answers the question of a proposed Decision: the Decision keeps the answer and becomes accepted.',
    'mine lists what needs the owner: the records in to-check, draft or review.',
    'signals lists the issues with the label user-feedback in the repository of the Project.',
    'signals insight adds a draft Insight at the level hunch that grows from the Signals.',
    'builds lists the pull requests of the repository of the Project, each with the Decisions or the Contract Version that it names. stale: the Contract Version is old, or a Decision is sunk.',
    'contract sign freezes the records of a Concept as its next Contract Version. Each record needs Trust solid.',
    'contract show prints the newest Contract Version: tier 1 (what to build), then tier 2 (the why).',
    'With --member: the records of the member, and the records that nobody has.',
    'member add takes the e-mail address of an account. A record or a Concept has one Responsible.',
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
      const [first] = rest
      const folder =
        isConceptFolder(first) || isPartFolder(first) ? first : undefined
      const flags = parseFlags(folder ? rest.slice(1) : rest)
      const product = (flags.project as string | undefined) ?? 'glue'
      const rows = [
        ...(isPartFolder(folder)
          ? []
          : await listConceptRecords(db, product, folder)),
        ...(isConceptFolder(folder)
          ? []
          : await listParts(
              db,
              product,
              folder ? [PART_FOLDERS[folder]] : Object.values(PART_FOLDERS),
            )),
      ]
      const states = new Map(
        (await listParts(db, product)).map((part) => [part.id, part]),
      )
      for (const row of rows) {
        console.log(formatRow({ ...row, ...states.get(row.id) }))
      }
      return
    }
    case 'mine': {
      const flags = parseFlags(rest)
      const product = (flags.project as string | undefined) ?? 'glue'
      const member = flags.member as string | undefined
      for (const part of await listMine(db, product, member)) {
        console.log(formatRow(part))
      }
      return
    }
    case 'answer': {
      const [id, answer, ...flagArgs] = rest
      // A flag in the place of the answer: the answer to a question.
      const asksQuestion = rest.length > 1 && answer.startsWith('--')
      const flags = parseFlags(asksQuestion ? rest.slice(1) : flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      const { waits_on: waitsOn, words, by } = flags
      const operations = createPartOperations({ db, github: getGithub() })
      const options = flags.option as string[] | undefined
      const { issue } = asksQuestion
        ? await operations.answerQuestion(
            product,
            id,
            parseQuestionAnswer({
              ...(options
                ? { option: Number(options[0]) }
                : { text: flags.text }),
              ...(by !== undefined && { by }),
            }),
          )
        : await operations.answerPart(
            product,
            id,
            parsePartAnswer({
              answer,
              ...(waitsOn !== undefined && { waitsOn }),
              ...(words !== undefined && { words }),
              ...(by !== undefined && { by }),
            }),
          )
      if (typeOfRecordId(id) === 'decision') {
        console.error(formatDownstreamIssue(product, id, issue))
      }
      return
    }
    case 'show': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      const type = typeOfRecordId(id)
      if (!type || !PART_TYPES.includes(type)) {
        const record = await showConceptRecord(db, product, id)
        printRecord(record, await findPart(db, product, id))
        return
      }
      const part = await findPart(db, product, id)
      if (!part) throw new Error(`"${id}" not found`)
      printPart(part)
      return
    }
    case 'add': {
      const [folder, ...flagArgs] = rest
      if (!isConceptFolder(folder) && !isPartFolder(folder)) {
        throw new Error(`"${folder}" is not a Concept type`)
      }
      const flags = parseFlags(flagArgs)
      const product = (flags.project as string | undefined) ?? 'glue'
      const body = (await readBody(flags)) ?? ''
      delete flags.project
      delete flags.body
      if (isPartFolder(folder)) {
        const part = parseNewPart({
          ...toPartInput(flags),
          type: PART_FOLDERS[folder],
          body,
        })
        console.log(await addPart(db, product, part))
        return
      }
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
      const type = typeOfRecordId(id)
      if (!type) throw new Error(`"${id}" is not a Concept id`)
      if (type !== 'decision') {
        const { project: _project, ...fields } = flags
        // An empty value clears the field. The type says if it can be empty.
        const cleared = Object.fromEntries(
          Object.entries(toPartInput(fields)).map(([field, value]) => [
            field,
            value === '' ? null : value,
          ]),
        )
        const change = { ...cleared, body: await readBody(flags) }
        await updatePart(db, product, id, parsePartChange(type, change))
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
    case 'signals':
      await handleSignalsCommand(db, getGithub, rest)
      return
    case 'builds':
      await handleBuildsCommand(db, getGithub, rest)
      return
    case 'concept':
      await handleConceptCommand(db, rest)
      return
    case 'contract':
      await handleContractCommand(db, rest)
      return
    case 'joint':
      await handleJointCommand(db, rest)
      return
    case 'project':
      await handleProjectCommand(db, rest)
      return
    case 'member':
      await handleMemberCommand(db, rest)
      return
    case 'assign': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const project = (flags.project as string | undefined) ?? 'glue'
      const role = flags.responsible ? 'responsible' : 'co-author'
      const member = flags.responsible ?? flags.co_author
      if (!member) {
        throw new Error(
          'assign needs --responsible <e-mail> or --co-author <e-mail>',
        )
      }
      const target = typeOfRecordId(id) ? { part: id } : { concept: id }
      await assign(db, project, { member, role, ...target })
      return
    }
    case 'product':
      throw new Error('"product" is gone: use "pnpm concept project set"')
    case 'token':
      await handleTokenCommand(db, rest)
      return
    default:
      throw new Error(`unknown command "${command}". See pnpm concept --help`)
  }
}

// `signals` lists the Signals of the Project, each with the Insight that
// grew from it. `signals insight <address> ... --title <title>` adds the
// Insight that grows from the Signals at the addresses.
async function handleSignalsCommand(
  db: ConceptDb,
  getGithub: () => GithubClient,
  args: string[],
) {
  const flags = parseFlags(args)
  const project = (flags.project as string | undefined) ?? 'glue'
  if (args[0] === 'insight') {
    const firstFlag = args.findIndex((arg) => arg.startsWith('--'))
    console.log(
      await addSignalInsight(db, getGithub(), project, {
        signals: args.slice(1, firstFlag === -1 ? undefined : firstFlag),
        title: flags.title as string,
        body: await readBody(flags),
        concept: flags.concept as string | undefined,
      }),
    )
    return
  }
  const { signals, reason } = await listSignals(db, getGithub(), project)
  if (reason !== null) console.error(`no Signals: ${reason}`)
  for (const { date, url, insight, title } of signals) {
    console.log([date, url, insight?.id, title].filter(Boolean).join('  '))
  }
}

// `builds` lists the builds of the Project: the number, the state, the
// Decisions and the Contract Version that it names, the stale mark, the title.
async function handleBuildsCommand(
  db: ConceptDb,
  getGithub: () => GithubClient,
  args: string[],
) {
  const project = (parseFlags(args).project as string | undefined) ?? 'glue'
  const { builds, reason } = await listBuilds(db, getGithub(), project)
  if (reason !== null) console.error(`no builds: ${reason}`)
  for (const { number, state, decisions, contract, stale, title } of builds) {
    console.log(
      [
        `#${number}`,
        state,
        ...decisions.map(({ id }) => id),
        contract && `${contract.concept}@${contract.version}`,
        stale && 'stale',
        title,
      ]
        .filter(Boolean)
        .join('  '),
    )
  }
}

// `concept add <slug> --title <title>`: nests a Concept in the Concept of
// `--parent`, or in the root.
async function handleConceptCommand(
  db: ConceptDb,
  [command, slug, ...rest]: string[],
) {
  if (command !== 'add') {
    throw new Error(`unknown concept command "${command}"`)
  }
  const flags = parseFlags(rest)
  const project = (flags.project as string | undefined) ?? 'glue'
  console.log(
    await addConcept(db, project, {
      slug,
      title: flags.title as string,
      kind: flags.kind as Kind | undefined,
      parent: flags.parent as string | undefined,
    }),
  )
}

function formatFrozenPart({ id, type, title }: FrozenPart) {
  return [id, type, title].join('  ')
}

// `contract sign <concept> --owner <name>` signs off the Concept and prints
// the new Contract Version as `<concept>@<version>`: what a PR names in its
// `Contract:` line. `contract show <concept>` prints the newest Version, or
// the one of `--version`.
async function handleContractCommand(
  db: ConceptDb,
  [command, concept, ...rest]: string[],
) {
  const flags = parseFlags(rest)
  const project = (flags.project as string | undefined) ?? 'glue'
  switch (command) {
    case 'sign': {
      const owner = flags.owner as string | undefined
      if (!concept || !owner) {
        throw new Error('contract sign needs <concept> and --owner')
      }
      const version = await signContract(db, project, concept, owner)
      console.log(`${concept}@${version}`)
      return
    }
    case 'show': {
      const sent = flags.version as string | undefined
      const version = sent === undefined ? undefined : Number(sent)
      const contract = await findContract(db, project, concept, version)
      if (!contract) {
        throw new Error(
          `"${concept}" has no Contract Version${sent === undefined ? '' : ` ${sent}`}`,
        )
      }
      console.log(`${contract.concept}@${contract.version}`)
      console.log(`checksum: ${contract.checksum}`)
      console.log(
        `signed: ${contract.signedBy} ${contract.signedAt.slice(0, 10)}`,
      )
      if (contract.newestVersion > contract.version) {
        console.log(
          `superseded_by: ${contract.concept}@${contract.newestVersion}`,
        )
      }
      const emptySlots = contract.slots.filter(({ filled }) => !filled)
      if (emptySlots.length > 0) {
        console.log(
          `empty slots: ${emptySlots.map(({ type }) => type).join(', ')}`,
        )
      }
      console.log('tier 1')
      for (const part of contract.tier1) console.log(formatFrozenPart(part))
      console.log('tier 2')
      for (const part of contract.tier2) console.log(formatFrozenPart(part))
      return
    }
    default:
      throw new Error(`unknown contract command "${command}"`)
  }
}

// `member add <e-mail>` makes the account of the e-mail address a member of
// the Project. `member list` prints each member with the loop steps and with
// the Concepts and Parts of each role.
async function handleMemberCommand(
  db: ConceptDb,
  [command, ...rest]: string[],
) {
  switch (command) {
    case 'add': {
      const [email, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const project = (flags.project as string | undefined) ?? 'glue'
      if (!email) throw new Error('member add needs <e-mail>')
      const member = await addMember(db, project, email)
      console.log(`${member.name}  ${member.email}`)
      return
    }
    case 'list': {
      const flags = parseFlags(rest)
      const project = (flags.project as string | undefined) ?? 'glue'
      const assignments = await listAssignments(db, project)
      for (const member of await listMembers(db, project)) {
        const held = assignmentRoles.flatMap((role) => {
          const ids = assignments
            .filter((item) => item.memberId === member.id && item.role === role)
            .map((item) => item.part ?? item.concept)
          return ids.length > 0 ? [`${role}: ${ids.join(',')}`] : []
        })
        console.log(
          [member.name, member.email, member.loopSteps.join(','), ...held]
            .filter(Boolean)
            .join('  '),
        )
      }
      return
    }
    default:
      throw new Error(`unknown member command "${command}"`)
  }
}

// `joint add <id> <needed id>` glues two Parts: the first needs the second.
// `--two-way`: they need each other. `joint remove` takes the Joint away.
async function handleJointCommand(
  db: ConceptDb,
  [command, id, neededId, ...rest]: string[],
) {
  const twoWay = rest.includes('--two-way')
  const flags = parseFlags(rest.filter((arg) => arg !== '--two-way'))
  const project = (flags.project as string | undefined) ?? 'glue'
  switch (command) {
    case 'add':
      await addJoint(db, project, { part: id, needs: neededId, twoWay })
      return
    case 'remove': {
      const part = await findPart(db, project, id)
      const joint = part?.needs.find((end) => end.part.id === neededId)
      if (!joint) throw new Error(`"${id}" and "${neededId}" have no Joint`)
      await removeJoint(db, project, joint.jointId)
      return
    }
    default:
      throw new Error(`unknown joint command "${command}"`)
  }
}

// `project add <slug>` adds a Project with its root Concept.
//
// `project set <slug> --analytics-project <key> --repository owner/name
// --social-handle <handle>`: the analytics project the Product's Goals are
// measured from, the GitHub repository that builds the Product, and its
// handle in the social channel. An empty key or handle removes it.
async function handleProjectCommand(
  db: ConceptDb,
  [command, slug, ...rest]: string[],
) {
  if (command === 'add') {
    if (!slug) throw new Error('project add needs <slug>')
    await addProject(db, slug)
    return
  }
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
