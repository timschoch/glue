// `pnpm concept`: read and add Glue's Concept records in the database.
// See src/part-fields.ts for the record types and their fields.
import { z } from 'zod'

import { createDb } from '../src/db/client.ts'
import type { ConceptDb } from '../src/db/client.ts'
import { listBuilds } from '../src/db/builds.ts'
import { findContract, signContract } from '../src/db/contracts.ts'
import type { FrozenPart } from '../src/db/contracts.ts'
import { listLeveledParts } from '../src/db/flight-level.ts'
import type { LeveledPart } from '../src/db/flight-level.ts'
import { goalMeasureSchema } from '../src/db/goal-measure.ts'
import type { GoalMeasure } from '../src/db/goal-measure.ts'
import type { Kind } from '../src/db/kinds.ts'
import {
  addMember,
  assign,
  assignmentRoles,
  listAssignments,
  listMembers,
  listWatchers,
  unwatch,
  watch,
} from '../src/db/members.ts'
import { createPartOperations } from '../src/db/part-operations.ts'
import type { DecisionStatusChange } from '../src/db/part-operations.ts'
import {
  addConcept,
  addJoint,
  addProject,
  removeConcept,
  removeJoint,
  updateConcept,
} from '../src/db/part-records.ts'
import type {
  NewPart,
  PartAnswer,
  PartChange,
  QuestionAnswer,
} from '../src/db/part-records.ts'
import {
  evidenceLevels,
  findPart,
  listMine,
  listParts,
} from '../src/db/parts.ts'
import type { JointEnd, Part, PartSummary, PartType } from '../src/db/parts.ts'
import { answers, slotReasons } from '../src/db/part-trust.ts'
import {
  BUILD_PROJECT,
  addProjectReference,
  findBuildProject,
  getProjectId,
  setAnalyticsProject,
  setProductRepository,
  setSocialHandle,
  setSupportUrl,
} from '../src/db/projects.ts'
import { parseRecordReference, typeOfRecordId } from '../src/db/record-id.ts'
import { createToken, deleteToken, listTokens } from '../src/db/tokens.ts'
import { createGithubClient } from '../src/github/client.ts'
import type { GithubClient } from '../src/github/client.ts'
import { createDownstreamIssue } from '../src/github/downstream-issue.ts'
import type { DownstreamIssue } from '../src/github/downstream-issue.ts'
import { listSignals } from '../src/db/signals.ts'
import { createSignalSources } from '../src/signals/signal-sources.server.ts'
import { evidenceTypes, isEvidence, partFields } from '../src/part-fields.ts'
import type { PartField } from '../src/part-fields.ts'
import { fetchGate } from './gate.ts'

const FLAG_TO_FIELD: Record<string, string> = {
  'analytics-project': 'analytics_project',
  'social-handle': 'social_handle',
  'enforced-by': 'enforced_by',
  'superseded-by': 'superseded_by',
  'waits-on': 'waits_on',
  'to-project': 'to_project',
  'co-author': 'co_author',
  level: 'evidence_level',
}

// The fields that a Part names in another way than the flags do.
const FIELD_TO_PART_KEY: Record<string, string> = {
  enforced_by: 'enforcedBy',
  evidence_level: 'evidenceLevel',
}

// The Part types with flags of their own, in the order of the list. `show`
// prints the fields of their type.
const CONCEPT_FOLDERS = {
  goals: 'goal',
  decisions: 'decision',
  insights: 'insight',
  guardrails: 'guardrail',
} as const

type ConceptFolder = keyof typeof CONCEPT_FOLDERS

// The Part types that `show` prints as a plain Part.
const PART_FOLDERS = {
  entities: 'entity',
  flows: 'flow',
  metrics: 'metric',
} as const

type PartFolder = keyof typeof PART_FOLDERS

const PART_TYPES: readonly PartType[] = Object.values(PART_FOLDERS)

const KNOWN_FIELDS = new Set([
  'title',
  'metric',
  'source',
  'date',
  'owner',
  'goal',
  'evidence',
  'enforced_by',
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
  'support',
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
  'to_project',
  'references',
  'pr',
])

type Flags = Record<string, string | string[] | GoalMeasure | undefined>

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
  return value !== undefined && value in CONCEPT_FOLDERS
}

function isPartFolder(value: string | undefined): value is PartFolder {
  return value !== undefined && value in PART_FOLDERS
}

// The flags as the fields of a Part.
function toPartInput(flags: Flags) {
  return Object.fromEntries(
    Object.entries(flags).map(([field, value]) => [
      FIELD_TO_PART_KEY[field] ?? field,
      value,
    ]),
  )
}

function isMissing(value: Flags[string]) {
  return (
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

// `add` names the first flag that the type needs and the command lacks. A
// Part without a date takes today.
function requireFlags(type: PartType, flags: Flags) {
  const fields: ReadonlyArray<PartField> = partFields[type]
  for (const { name, flag = name, kind, required } of fields) {
    const key = FLAG_TO_FIELD[flag] ?? flag
    if (required && kind !== 'date' && isMissing(flags[key]))
      throw new Error(`"${key}" is required`)
  }
}

// The letter of a record id names its type. An id with the letter of
// another type is not a record of the type that the flag asks for.
function requireType(id: string, types: readonly PartType[], name: string) {
  const type = typeOfRecordId(parseRecordReference(id).recordId)
  if (!type || !types.includes(type))
    throw new Error(`${name} "${id}" not found`)
  return id
}

// The flags as the fields of a Decision. Its Goal and its evidence come
// first in what it needs.
function toDecisionInput({
  goal,
  evidence,
  needs,
  superseded_by: supersededBy,
  option,
  pick,
  ...fields
}: Flags) {
  return {
    ...fields,
    needs: [
      requireType(String(goal), ['goal'], 'goal'),
      ...(Array.isArray(evidence) ? evidence : []).map((id) =>
        requireType(id, evidenceTypes, 'evidence'),
      ),
      ...(Array.isArray(needs) ? needs : []),
    ],
    supersededBy,
    options: option,
    pick: pick === undefined ? undefined : Number(pick),
  }
}

export function parseFlags(args: string[]): Flags {
  const flags: Flags = {}
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

// The Project of a command: the one of `--project`, or the build Project.
function readProject(db: ConceptDb, flags: Flags) {
  return (flags.project as string | undefined) ?? findBuildProject(db)
}

// A needed Part as a command names it. A reference has its Project first.
function formatNeededId({ project, part }: JointEnd) {
  return project ? `${project.slug}/${part.id}` : part.id
}

// A needed Part in a line of `show`. A reference has its Trust too. A Joint
// that was built with a Contract Version has that Version.
function formatNeeded(end: JointEnd) {
  const { title, trust } = end.part
  const version =
    end.contractVersion !== null && `version ${end.contractVersion}`
  return [formatNeededId(end), version, end.project && trust, title]
    .filter(Boolean)
    .join(' ')
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
async function readBody(flags: Flags): Promise<string | undefined> {
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
  flightLevel,
  title,
}: Pick<PartSummary, 'id' | 'status' | 'title'> &
  Partial<Pick<LeveledPart, 'trust' | 'workState' | 'flightLevel'>>) {
  return [id, status, trust, workState, flightLevel, title]
    .filter(Boolean)
    .join('  ')
}

// The Trust and the Work state of the Part, its empty slots, the Parts under
// review that it needs, its open flags and the Part that it waits on.
function printTrust(part: Part) {
  console.log(`trust: ${part.trust}`)
  for (const slot of part.emptySlots) {
    console.log(`empty_slot: ${slotReasons[slot]}`)
  }
  for (const { id, type, title } of part.reviewNotes) {
    console.log(`under_review: ${type} ${id} ${title}`)
  }
  console.log(`work_state: ${part.workState}`)
  if (part.measure) {
    const { target, latestValue, onTarget, measuredAt } = part.measure
    if (target !== null) console.log(`target: ${target}`)
    if (latestValue !== null) console.log(`value: ${latestValue}`)
    if (onTarget !== null) console.log(`on_target: ${onTarget}`)
    if (measuredAt) console.log(`measured_at: ${measuredAt}`)
  }
  for (const { cause, reason, createdAt, contract } of part.flags) {
    const date = createdAt.slice(0, 10)
    console.log(`flag: ${cause.id} ${reason} ${date} ${cause.title}`)
    if (!contract) continue
    console.log(
      `version: ${cause.id} ${contract.builtWith} -> ${contract.newest}`,
    )
    for (const { field, before, after } of contract.changes) {
      console.log(
        `change: ${cause.id} ${field}: ${before ?? ''} -> ${after ?? ''}`,
      )
    }
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

// The fields of a Goal, a Decision, an Insight or a Guardrail that `show`
// prints, in their order. A Goal without a measure has no readings.
function listShownFields(part: Part): Record<string, unknown> {
  const { title, source, status, measure } = part
  switch (part.type) {
    case 'goal':
      return {
        title,
        metric: part.metric,
        source,
        measure: measure?.measure ?? null,
        status,
        baseline: measure?.baseline ?? null,
        latestValue: measure?.latestValue ?? null,
        latestBreakdownValue: measure?.latestBreakdownValue ?? null,
        measuredAt: measure?.measuredAt ?? null,
      }
    case 'decision':
      return {
        title,
        date: part.date,
        owner: part.owner,
        status,
        ...(part.issueUrl && { issue: part.issueUrl }),
      }
    case 'insight':
      return {
        title,
        date: part.date,
        source,
        status,
        evidenceLevel: part.evidenceLevel,
      }
    default:
      return { title, enforcedBy: part.enforcedBy, source }
  }
}

// What a Decision needs: its Goal, its evidence, then each other Part.
function printDecisionLinks(decision: Part) {
  const needed = decision.needs
  const goal = needed.find(({ part }) => part.type === 'goal')
  if (goal) console.log(`goal: ${formatNeeded(goal)}`)
  for (const item of needed.filter(({ part }) => isEvidence(part.type))) {
    console.log(`evidence: ${formatNeeded(item)}`)
  }
  for (const item of needed) {
    if (item.part.type !== 'goal' && !isEvidence(item.part.type))
      console.log(`needs: ${formatNeeded(item)}`)
  }
  if (decision.supersededBy)
    console.log(`superseded_by: ${decision.supersededBy.id}`)
  for (const { id } of decision.supersedes) console.log(`supersedes: ${id}`)
}

function printRecord(part: Part) {
  console.log(part.id)
  for (const [key, value] of Object.entries(listShownFields(part))) {
    console.log(`${key}: ${formatFieldValue(value)}`)
  }
  if (part.type === 'decision') printDecisionLinks(part)
  printQuestion(part)
  printTrust(part)
  if (part.body) console.log(`\n${part.body}`)
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
  for (const needed of part.needs) {
    console.log(`needs: ${formatNeeded(needed)}`)
  }
  printTrust(part)
  if (part.body) console.log(`\n${part.body}`)
}

// The flags that `add` needs for the Part type. The title comes first, and
// the date comes before the other fields.
function formatNeededFlags(type: PartType) {
  const fields: ReadonlyArray<PartField> = partFields[type]
  const [title, ...rest] = fields.filter(({ required }) => required)
  const isDate = ({ kind }: PartField) => kind === 'date'
  return [
    title,
    ...rest.filter(isDate),
    ...rest.filter((field) => !isDate(field)),
  ]
    .map(({ name, flag = name }) => `--${flag}`)
    .join(' ')
}

function formatHelp() {
  const types = Object.entries(CONCEPT_FOLDERS).map(
    ([folder, type]) => `  ${folder}: ${formatNeededFlags(type)}`,
  )
  return [
    'pnpm concept list [<type>] [--member <e-mail>]',
    'pnpm concept show <id>',
    'pnpm concept add <type> <flags of the type> [--body <text>, or - for stdin]',
    'pnpm concept set <id> <flags of the type> [--body <text>, or - for stdin]',
    'pnpm concept move <id> [<id> ...] --concept <slug>',
    'pnpm concept move <id> [<id> ...] --concept <slug> --to-project <slug> [--drop-refused-joints]',
    'pnpm concept downstream <id>',
    'pnpm concept answer <id> <answer> [--waits-on <id>] [--words <text> --by <name>]',
    'pnpm concept answer <id> move-to-version --needs <needed id> --version <number>',
    'pnpm concept answer <id> --option <number> --by <name>',
    'pnpm concept answer <id> --text <answer> --by <name>',
    'pnpm concept signals [--source <name>]',
    'pnpm concept signals insight <address> [<address> ...] --title <title> [--concept <slug>] [--body <text>]',
    'pnpm concept builds',
    'pnpm concept gate --pr <number> [--project <slug>]',
    'pnpm concept mine [--member <e-mail>]',
    'pnpm concept member add <e-mail>',
    'pnpm concept member list',
    'pnpm concept assign <id or Concept slug> --responsible <e-mail>',
    'pnpm concept assign <id or Concept slug> --co-author <e-mail>',
    'pnpm concept watch <id> --member <e-mail>',
    'pnpm concept unwatch <id> --member <e-mail>',
    'pnpm concept watchers [<id>]',
    'pnpm concept concept add <slug> --title <title> [--kind <kind>] [--parent <slug>]',
    'pnpm concept concept set <slug> [--title <title>] [--parent <slug>]',
    'pnpm concept concept remove <slug>',
    'pnpm concept contract show <concept> [--version <number>]',
    'pnpm concept contract sign <concept> --owner <name>',
    'pnpm concept joint add <id> <needed id> [--two-way]',
    'pnpm concept joint add <id> <project>/<needed id>',
    'pnpm concept joint remove <id> <needed id>',
    'pnpm concept project add <slug>',
    'pnpm concept project set <slug> [--analytics-project <key>] [--repository <owner/name>] [--social-handle <handle>] [--support <url>] [--references <slug>]',
    'pnpm concept token create --project <slug> --name <name>',
    'pnpm concept token list',
    'pnpm concept token revoke <id>',
    '',
    'list, show, add, set, move, downstream, answer, mine, signals, builds, member, assign, watch, unwatch, watchers, concept, contract and joint take --project <slug>. The default is GLUE_PROJECT, then glue-build when that Project exists, then glue.',
    '',
    'Types, and the flags that add needs:',
    ...types,
    `  ${Object.keys(PART_FOLDERS).join(', ')}: ${formatNeededFlags(PART_TYPES[0])}`,
    '  goals and metrics also take --measure <json>, decisions --supersedes <id>',
    '  decisions also take --option <text>, once per option, and --pick <number>: the option that the author would take',
    `  insights also take --level ${evidenceLevels.join('|')} and --status draft`,
    '  guardrails, entities, flows and metrics also take --source',
    '  entities, flows and metrics also take --owner',
    '  each type takes --concept <slug>: its home Concept. The default is the root.',
    '  each type takes --responsible <e-mail>: the member who owns the new record.',
    '  decisions, entities, flows and metrics take --needs: the records that it needs',
    '  --evidence and --needs take ids with commas between them: I1,I2',
    '',
    'set on a Decision takes --status, --superseded-by, --title, --goal <id> and --body.',
    '--goal gives the Decision another Goal in the place of the one that it has.',
    'The issue of a Decision keeps the title that it has.',
    'On each other type it takes the flags of the type.',
    'set and move take --concept <slug>: the new home Concept of the record, in the same Project. The record keeps its id and its Joints.',
    'move with --to-project moves the records to a Concept of another Project. A record id that the Project has already refuses the move.',
    'A Joint to a record of another Project is a reference: glue/D4. project set <slug> --references <slug> lets the first Project reference the second.',
    'A move that leaves a Joint that no reference allows is refused. --drop-refused-joints removes these Joints and prints them.',
    'An empty value clears the field: --status "".',
    '',
    `answer takes ${answers.join(', ')}. The Work state of the record says which ones.`,
    'wait needs --waits-on: the record that it waits on.',
    'answer move-to-version answers the flag new-version: the Joint to the needed record moves to the newest Contract Version, and the flag closes.',
    '--words is an answer in words: it goes to the end of the body with the name of --by and the date.',
    'answer with --option or --text answers the question of a proposed Decision: the Decision keeps the answer and becomes accepted.',
    'mine lists what needs the owner: the records in to-check, draft or review.',
    'signals lists the Signals of the Project in each source. github: the issues with the label user-feedback in its repository. support: the tickets of its help desk. analytics: the survey answers with a low score in its analytics project.',
    'signals insight adds a draft Insight at the level hunch that grows from the Signals.',
    'builds lists the pull requests of the repository of the Project, each with the Decisions or the Contract Version that it names. stale: the Contract Version is old, or a Decision is sunk.',
    'gate asks Glue over its HTTP API if the pull request of GITHUB_REPOSITORY names the newest Contract Version of its Concept, or Decisions that stand. Glue keeps the answer with the build. breaks exits 1. It needs GLUE_API_TOKEN and no database. The default Project is GLUE_PROJECT, then glue-build.',
    'concept remove removes a Concept that holds nothing: no record, no Concept and no Contract Version. The root Concept stays.',
    'contract sign freezes the records of a Concept as its next Contract Version. Each record needs Trust solid.',
    'contract show prints the newest Contract Version: tier 1 (what to build), then tier 2 (the why).',
    'mine with --member: the records of the member, and the records that nobody has.',
    'list with --member: each record with its flight level for the member. operational: the record is of a loop step of the member, or the member is Responsible or Co-Author of the record or of its Concept. strategic: each other record.',
    'member add takes the e-mail address of an account. A record or a Concept has one Responsible.',
    'The Responsible of a record is its owner: assign <id> --responsible sets the owner.',
    'watch makes a member a watcher of a record. A watcher is not the owner. watchers lists who watches, of one record or of the Project.',
  ].join('\n')
}

// `gate --pr <number>` asks the gate of the Project if the pull request
// holds. `breaks` prints the reasons and exits 1.
async function handleGateCommand(
  args: string[],
  environment: Record<string, string | undefined>,
  fetchApi: typeof fetch,
) {
  const flags = parseFlags(args)
  const number = Number(flags.pr)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('gate needs --pr <number>')
  }
  const project =
    (flags.project as string | undefined) ??
    environment.GLUE_PROJECT ??
    BUILD_PROJECT
  const gate = await fetchGate({ project, number }, environment, fetchApi)
  console.log(`#${number}  ${gate.result}`)
  for (const reason of gate.reasons) console.error(`  - ${reason}`)
  if (gate.result === 'breaks') process.exitCode = 1
}

// No command, or `--help` at any place, prints the commands. It needs no
// database, and `gate` needs none: it asks the HTTP API.
export async function main(
  args: string[],
  databaseUrl: string | undefined,
  environment: Record<string, string | undefined> = process.env,
  fetchApi: typeof fetch = fetch,
) {
  if (args.length === 0 || args.includes('--help')) {
    console.log(formatHelp())
    return
  }
  if (args[0] === 'gate') {
    await handleGateCommand(args.slice(1), environment, fetchApi)
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
      const product = await readProject(db, flags)
      if (!isPartFolder(folder)) await getProjectId(db, product)
      const folders = { ...CONCEPT_FOLDERS, ...PART_FOLDERS }
      const types = folder ? [folders[folder]] : Object.values(folders)
      const member = flags.member as string | undefined
      const parts: Array<PartSummary | LeveledPart> =
        member === undefined
          ? await listParts(db, product, types)
          : await listLeveledParts(db, product, member, types)
      for (const type of types) {
        for (const part of parts.filter((listed) => listed.type === type)) {
          console.log(formatRow(part))
        }
      }
      return
    }
    case 'mine': {
      const flags = parseFlags(rest)
      const product = await readProject(db, flags)
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
      const product = await readProject(db, flags)
      const { waits_on: waitsOn, words, by, version } = flags
      const needs = flags.needs as string[] | undefined
      const operations = createPartOperations({ db, github: getGithub() })
      const options = flags.option as string[] | undefined
      // The operation reads the answer with its schema.
      const { issue } = asksQuestion
        ? await operations.answerQuestion(product, id, {
            ...(options
              ? { option: Number(options[0]) }
              : { text: flags.text }),
            ...(by !== undefined && { by }),
          } as QuestionAnswer)
        : await operations.answerPart(product, id, {
            answer,
            ...(waitsOn !== undefined && { waitsOn }),
            ...(needs && { needs: needs[0] }),
            ...(version !== undefined && { version: Number(version) }),
            ...(words !== undefined && { words }),
            ...(by !== undefined && { by }),
          } as PartAnswer)
      if (typeOfRecordId(id) === 'decision') {
        console.error(formatDownstreamIssue(product, id, issue))
      }
      return
    }
    case 'show': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = await readProject(db, flags)
      const type = typeOfRecordId(id)
      const isPlain = type !== undefined && PART_TYPES.includes(type)
      if (!isPlain) await getProjectId(db, product)
      if (!type) throw new Error(`"${id}" is not a Concept id`)
      const operations = createPartOperations({ db, github: getGithub() })
      const part = await operations.getPart(product, id)
      if (isPlain) printPart(part)
      else printRecord(part)
      return
    }
    case 'add': {
      const [folder, ...flagArgs] = rest
      if (!isConceptFolder(folder) && !isPartFolder(folder)) {
        throw new Error(`"${folder}" is not a Concept type`)
      }
      const flags = parseFlags(flagArgs)
      const product = await readProject(db, flags)
      const body = (await readBody(flags)) ?? ''
      delete flags.project
      delete flags.body
      const type = isPartFolder(folder)
        ? PART_FOLDERS[folder]
        : CONCEPT_FOLDERS[folder]
      const isDecision = type === 'decision'
      if (isConceptFolder(folder)) {
        requireFlags(type, flags)
        // A Decision serves a Goal, so its Project exists already.
        if (!isDecision) await addProject(db, product)
      }
      const fields = isDecision ? toDecisionInput(flags) : toPartInput(flags)
      const operations = createPartOperations({ db, github: getGithub() })
      // The operation reads the new Part with the schema of its type.
      const { part, issue } = await operations.addPart(product, {
        ...fields,
        type,
        body,
      } as NewPart)
      console.log(part.id)
      if (isDecision) {
        console.error(formatDownstreamIssue(product, part.id, issue))
      }
      return
    }
    case 'set': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = await readProject(db, flags)
      const type = typeOfRecordId(id)
      if (!type) throw new Error(`"${id}" is not a Concept id`)
      const operations = createPartOperations({ db, github: getGithub() })
      if (type !== 'decision') {
        const { project: _project, ...fields } = flags
        // An empty value clears the field. The type says if it can be empty.
        const cleared = Object.fromEntries(
          Object.entries(toPartInput(fields)).map(([field, value]) => [
            field,
            value === '' ? null : value,
          ]),
        )
        // The operation reads the change with the schema of the type.
        const change = { ...cleared, body: await readBody(flags) } as PartChange
        await operations.updatePart(product, id, change)
        return
      }
      // The home, the title, the Goal and the body change without a status.
      const change = {
        concept: flags.concept,
        title: flags.title,
        goal: flags.goal,
        body: await readBody(flags),
      }
      if (Object.values(change).some((value) => value !== undefined)) {
        await operations.updatePart(product, id, change as PartChange)
        if (flags.status === undefined) return
      }
      // The operation holds the rule of the status and of the successor.
      const { issue } = await operations.setDecisionStatus(product, id, {
        status: flags.status,
        supersededBy: flags.superseded_by || undefined,
      } as DecisionStatusChange)
      console.error(formatDownstreamIssue(product, id, issue))
      return
    }
    case 'move': {
      const firstFlag = rest.findIndex((arg) => arg.startsWith('--'))
      const ids = rest.slice(0, firstFlag === -1 ? undefined : firstFlag)
      const dropRefusedJoints = rest.includes('--drop-refused-joints')
      const flags = parseFlags(
        rest.filter((arg) => arg !== '--drop-refused-joints'),
      )
      const product = await readProject(db, flags)
      const concept = flags.concept as string | undefined
      const toProject = flags.to_project as string | undefined
      if (ids.length === 0 || concept === undefined) {
        throw new Error('move needs <id> and --concept <slug>')
      }
      const operations = createPartOperations({ db, github: getGithub() })
      if (toProject === undefined) {
        await operations.moveParts(product, ids, concept)
        return
      }
      const { droppedJoints } = await operations.movePartsToProject(
        product,
        ids,
        { project: toProject, concept, dropRefusedJoints },
      )
      for (const { part, needs } of droppedJoints) {
        console.log(`dropped: ${part} needs ${needs}`)
      }
      return
    }
    case 'downstream': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const product = await readProject(db, flags)
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
      const project = await readProject(db, flags)
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
    case 'watch':
    case 'unwatch': {
      const [id, ...flagArgs] = rest
      const flags = parseFlags(flagArgs)
      const project = await readProject(db, flags)
      const member = flags.member as string | undefined
      if (!id || id.startsWith('--') || !member) {
        throw new Error(`${command} needs <id> --member <e-mail>`)
      }
      const change = command === 'watch' ? watch : unwatch
      await change(db, project, { member, part: id })
      return
    }
    case 'watchers': {
      const recordId = rest[0]?.startsWith('--') ? undefined : rest[0]
      const flags = parseFlags(recordId ? rest.slice(1) : rest)
      const project = await readProject(db, flags)
      const members = await listMembers(db, project)
      for (const watcher of await listWatchers(db, project, recordId)) {
        const member = members.find(({ id }) => id === watcher.memberId)
        console.log(`${watcher.part}  ${member?.name}  ${member?.email}`)
      }
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

// `signals` lists the Signals of the Project in all sources, each with its
// source and the Insight that grew from it. `--source <name>`: the Signals
// of that source only. `signals insight <address> ... --title <title>` adds the
// Insight that grows from the Signals at the addresses.
async function handleSignalsCommand(
  db: ConceptDb,
  getGithub: () => GithubClient,
  args: string[],
) {
  const flags = parseFlags(args)
  const project = await readProject(db, flags)
  if (args[0] === 'insight') {
    const firstFlag = args.findIndex((arg) => arg.startsWith('--'))
    const operations = createPartOperations({ db, github: getGithub() })
    const { part } = await operations.addSignalInsight(project, {
      signals: args.slice(1, firstFlag === -1 ? undefined : firstFlag),
      title: flags.title as string,
      body: await readBody(flags),
      concept: flags.concept as string | undefined,
    })
    console.log(part.id)
    return
  }
  const { signals, failures } = await listSignals(
    db,
    createSignalSources(getGithub()),
    project,
    { source: flags.source as string | undefined },
  )
  for (const { source, reason } of failures) {
    console.error(`${source}: ${reason}`)
  }
  for (const { date, source, url, insight, title } of signals) {
    console.log(
      [date, source, url, insight?.id, title].filter(Boolean).join('  '),
    )
  }
}

// `builds` lists the builds of the Project: the number, the state, the
// Decisions and the Contract Version that it names, the stale mark, the title.
async function handleBuildsCommand(
  db: ConceptDb,
  getGithub: () => GithubClient,
  args: string[],
) {
  const project = await readProject(db, parseFlags(args))
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
// `--parent`, or in the root. `concept set <slug>` gives a Concept that
// exists a new title, a new parent, or both. `concept remove <slug>` removes
// a Concept that holds nothing.
async function handleConceptCommand(
  db: ConceptDb,
  [command, slug, ...rest]: string[],
) {
  if (command !== 'add' && command !== 'set' && command !== 'remove') {
    throw new Error(`unknown concept command "${command}"`)
  }
  const flags = parseFlags(rest)
  const project = await readProject(db, flags)
  if (command === 'remove') {
    await removeConcept(db, project, slug)
    return
  }
  if (command === 'set') {
    await updateConcept(db, project, slug, {
      title: flags.title as string | undefined,
      parent: flags.parent as string | undefined,
    })
    return
  }
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
  const project = await readProject(db, flags)
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
      const project = await readProject(db, flags)
      if (!email) throw new Error('member add needs <e-mail>')
      const member = await addMember(db, project, email)
      console.log(`${member.name}  ${member.email}`)
      return
    }
    case 'list': {
      const flags = parseFlags(rest)
      const project = await readProject(db, flags)
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
// `glue/D4` names a Part of another Project: a reference.
// `--two-way`: they need each other. `joint remove` takes the Joint away.
async function handleJointCommand(
  db: ConceptDb,
  [command, id, neededId, ...rest]: string[],
) {
  const twoWay = rest.includes('--two-way')
  const flags = parseFlags(rest.filter((arg) => arg !== '--two-way'))
  const project = await readProject(db, flags)
  switch (command) {
    case 'add':
      await addJoint(db, project, { part: id, needs: neededId, twoWay })
      return
    case 'remove': {
      const part = await findPart(db, project, id)
      const joint = part?.needs.find((end) => formatNeededId(end) === neededId)
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
// --social-handle <handle> --support <url>`: the analytics project the
// Product's Goals are measured from, the GitHub repository that builds the
// Product, its handle in the social channel, and the address of its help
// desk. An empty key, handle or address removes it.
// `--references <slug>`: a Part of the Project may need a Part of that one.
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
  const supportUrl = flags.support as string | undefined
  const references = flags.references as string | undefined
  if (
    !slug ||
    (analyticsProject === undefined &&
      !repository &&
      socialHandle === undefined &&
      supportUrl === undefined &&
      !references)
  ) {
    throw new Error(
      'project set needs <slug> and --analytics-project, --repository owner/name, --social-handle, --support or --references',
    )
  }
  if (supportUrl !== undefined) {
    await setSupportUrl(db, slug, supportUrl || null)
  }
  if (references) await addProjectReference(db, slug, references)
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
