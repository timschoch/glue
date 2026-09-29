// Checks concept/: one Markdown file per record, YAML frontmatter plus body.
// Runs as a `ci` step in .skilly/verify.json. Fails when:
//   - a record misses a required field, or its id does not match its
//     folder or file name
//   - two records share an id
//   - a Decision's goal, evidence or superseded_by points to an id that
//     does not exist
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

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null
  const [, frontmatter] = match
  const data = {}
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
      data[key] = stripQuotes(value.trim())
      listKey = null
    }
  }
  return data
}

export function loadConcept(root) {
  const records = []
  for (const [folder, type] of Object.entries(TYPES)) {
    const dir = join(root, folder)
    let files
    try {
      files = readdirSync(dir).filter((file) => /^[A-Z]\d+-.*\.md$/.test(file))
    } catch {
      files = []
    }
    for (const file of files) {
      const raw = readFileSync(join(dir, file), 'utf8')
      const data = parseFrontmatter(raw)
      records.push({
        folder,
        type,
        file,
        path: `${folder}/${file}`,
        data,
      })
    }
  }
  return records
}

export function problems(records) {
  const found = []
  const idOwners = new Map()

  for (const record of records) {
    const { path, file, type, data } = record
    if (!data) {
      found.push(`${path}: missing YAML frontmatter.`)
      continue
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
    if (data.goal && !idOwners.has(data.goal)) {
      found.push(`${path}: goal "${data.goal}" does not exist.`)
    }
    for (const evidence of data.evidence ?? []) {
      if (!idOwners.has(evidence)) {
        found.push(`${path}: evidence "${evidence}" does not exist.`)
      }
    }
    if (data.superseded_by && !idOwners.has(data.superseded_by)) {
      found.push(
        `${path}: superseded_by "${data.superseded_by}" does not exist.`,
      )
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
