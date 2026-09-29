// Checks concept/: one Markdown file per record, YAML frontmatter plus body.
// Runs as a `ci` step in .skilly/verify.json. Fails when:
//   - a record misses a required field, or its id does not match its
//     folder or file name
//   - two records share an id
//   - a Decision's goal, evidence or superseded_by points to an id that
//     does not exist, or exists as the wrong record type
//   - a frontmatter value needs quoting for a YAML parser to read it
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const TYPES = {
  goals: { prefix: 'G', required: ['id', 'title', 'metric', 'source'] },
  decisions: {
    prefix: 'D',
    required: ['id', 'title', 'date', 'owner', 'status', 'goal', 'evidence'],
  },
  insights: { prefix: 'I', required: ['id', 'title', 'date', 'source'] },
  facts: { prefix: 'F', required: ['id', 'title', 'source'] },
  guardrails: { prefix: 'R', required: ['id', 'title', 'enforced_by'] },
}

const DECISION_STATUSES = ['proposed', 'accepted', 'superseded']

function isQuoted(value) {
  return (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
}

function stripQuotes(value) {
  return isQuoted(value) ? value.slice(1, -1) : value
}

// A real YAML parser reads ": " inside an unquoted scalar as a nested
// mapping and rejects it. Flag it here so any YAML parser can read these
// files later.
function shouldQuote(value) {
  return !isQuoted(value) && value.includes(': ')
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null
  const [, frontmatter, rest] = match
  const body = rest.trim()
  const data = {}
  const errors = []
  let listKey = null
  for (const line of frontmatter.split('\n')) {
    if (!line.trim()) continue
    const listItem = line.match(/^\s*-\s*(.+)$/)
    if (listItem && listKey) {
      data[listKey].push(stripQuotes(listItem[1].trim()))
      continue
    }
    const entry = line.match(/^(\w+):\s*(.*)$/)
    if (!entry) continue
    const [, key, value] = entry
    if (value === '') {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean)
      listKey = null
    } else {
      if (shouldQuote(value.trim())) {
        errors.push(`"${key}" must be quoted: the value contains ": ".`)
      }
      data[key] = stripQuotes(value.trim())
      listKey = null
    }
  }
  return { data, errors, body }
}

export function loadConcept(root) {
  const records = []
  for (const [folder, type] of Object.entries(TYPES)) {
    const dir = join(root, folder)
    let files
    try {
      files = readdirSync(dir).filter((file) => file.endsWith('.md'))
    } catch {
      files = []
    }
    for (const file of files) {
      const raw = readFileSync(join(dir, file), 'utf8')
      const parsed = parseFrontmatter(raw)
      records.push({
        folder,
        type,
        file,
        path: `${folder}/${file}`,
        data: parsed?.data ?? null,
        errors: parsed?.errors ?? [],
        body: parsed?.body ?? '',
      })
    }
  }
  return records
}

export function problems(records) {
  const found = []
  const idOwners = new Map()

  for (const record of records) {
    const { path, file, type, data, errors } = record
    if (!data) {
      found.push(`${path}: missing YAML frontmatter.`)
      continue
    }
    for (const error of errors) {
      found.push(`${path}: ${error}`)
    }
    for (const field of type.required) {
      const value = data[field]
      if (
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        found.push(`${path}: missing required field "${field}".`)
      }
    }
    const { id } = data
    if (!id) continue
    if (id[0] !== type.prefix || !/^\d+$/.test(id.slice(1))) {
      found.push(
        `${path}: id "${id}" does not match folder ${record.folder} (expected prefix "${type.prefix}").`,
      )
    }
    if (!file.startsWith(`${id}-`)) {
      found.push(`${path}: id "${id}" does not match file name.`)
    }
    if (idOwners.has(id)) {
      found.push(`${path}: id "${id}" is already used by ${idOwners.get(id)}.`)
    } else {
      idOwners.set(id, path)
    }
  }

  for (const record of records) {
    if (record.folder !== 'decisions' || !record.data) continue
    const { path, data } = record
    if (data.status && !DECISION_STATUSES.includes(data.status)) {
      found.push(
        `${path}: status "${data.status}" must be one of ${DECISION_STATUSES.join(', ')}.`,
      )
    }
    if (data.status === 'superseded' && !data.superseded_by) {
      found.push(`${path}: superseded Decision needs "superseded_by".`)
    }
    if (data.goal) {
      if (!idOwners.has(data.goal)) {
        found.push(`${path}: goal "${data.goal}" does not exist.`)
      } else if (data.goal[0] !== 'G') {
        found.push(`${path}: goal "${data.goal}" must be a Goal (G) id.`)
      }
    }
    for (const evidence of data.evidence ?? []) {
      if (!idOwners.has(evidence)) {
        found.push(`${path}: evidence "${evidence}" does not exist.`)
      } else if (!['I', 'F'].includes(evidence[0])) {
        found.push(
          `${path}: evidence "${evidence}" must be an Insight (I) or Fact (F) id.`,
        )
      }
    }
    if (data.superseded_by) {
      if (!idOwners.has(data.superseded_by)) {
        found.push(
          `${path}: superseded_by "${data.superseded_by}" does not exist.`,
        )
      } else if (data.superseded_by[0] !== 'D') {
        found.push(
          `${path}: superseded_by "${data.superseded_by}" must be a Decision (D) id.`,
        )
      }
    }
  }

  return found
}

function main() {
  const root = process.argv[2] ?? join(process.cwd(), 'concept')
  const found = problems(loadConcept(root))
  if (found.length === 0) return
  console.error(
    ['concept check failed:', ...found.map((line) => `  - ${line}`)].join('\n'),
  )
  process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
