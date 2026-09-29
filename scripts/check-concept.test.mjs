import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadConcept, problems } from './check-concept.mjs'

function seed(root) {
  write(root, 'goals', 'G1-run-goal.md', {
    id: 'G1',
    title: 'Run goal',
    metric: 'Agents ship Decisions.',
    source: 'https://example.com/issue/8',
  })
  write(root, 'insights', 'I1-no-decision.md', {
    id: 'I1',
    title: 'Merged PRs cite no Decision.',
    date: '2026-09-01',
    source: 'https://example.com/pr/7',
  })
  write(root, 'facts', 'F1-cheapest-form.md', {
    id: 'F1',
    title: 'Ring 0: the cheapest form wins.',
    source: 'CLAUDE.md#build-concentric',
  })
  write(root, 'decisions', 'D1-concept-files.md', {
    id: 'D1',
    title: 'Concept lives as Markdown files.',
    date: '2026-09-01',
    owner: 'Orchestrator',
    status: 'proposed',
    goal: 'G1',
    evidence: ['I1', 'F1'],
  })
}

function write(root, folder, file, data) {
  const dir = join(root, folder)
  mkdirSync(dir, { recursive: true })
  const frontmatter = Object.entries(data)
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}:\n${value.map((item) => `  - ${item}`).join('\n')}`
        : `${key}: ${value}`,
    )
    .join('\n')
  writeFileSync(join(dir, file), `---\n${frontmatter}\n---\nBody text.\n`)
}

function withRoot(callback) {
  const root = mkdtempSync(join(tmpdir(), 'concept-'))
  try {
    callback(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a complete seed passes', () => {
  withRoot((root) => {
    seed(root)
    assert.deepEqual(problems(loadConcept(root)), [])
  })
})

test('a missing required field fails', () => {
  withRoot((root) => {
    seed(root)
    write(root, 'guardrails', 'R1-budget.md', {
      id: 'R1',
      title: 'Budget 0.',
    })
    const [found] = problems(loadConcept(root))
    assert.match(found, /R1-budget\.md.*missing required field "enforced_by"/)
  })
})

test('an id that does not match its folder fails', () => {
  withRoot((root) => {
    seed(root)
    write(root, 'goals', 'G2-wrong-prefix.md', {
      id: 'D9',
      title: 'Wrong prefix',
      metric: 'x',
      source: 'https://example.com',
    })
    const found = problems(loadConcept(root))
    assert.ok(found.some((line) => /does not match folder/.test(line)))
  })
})

test('an id that does not match its file name fails', () => {
  withRoot((root) => {
    seed(root)
    write(root, 'goals', 'G2-mismatch.md', {
      id: 'G3',
      title: 'Mismatched id',
      metric: 'x',
      source: 'https://example.com',
    })
    const found = problems(loadConcept(root))
    assert.ok(found.some((line) => /does not match file name/.test(line)))
  })
})

test('two records sharing an id fail', () => {
  withRoot((root) => {
    seed(root)
    write(root, 'facts', 'G1-duplicate.md', {
      id: 'G1',
      title: 'Duplicate id',
      source: 'https://example.com',
    })
    const found = problems(loadConcept(root))
    assert.ok(found.some((line) => /already used by/.test(line)))
  })
})

test('a Decision pointing at a missing goal, evidence or superseded_by fails', () => {
  withRoot((root) => {
    seed(root)
    write(root, 'decisions', 'D2-dangling.md', {
      id: 'D2',
      title: 'Dangling references',
      date: '2026-09-01',
      owner: 'Orchestrator',
      status: 'superseded',
      goal: 'G9',
      evidence: ['I9'],
      superseded_by: 'D9',
    })
    const found = problems(loadConcept(root))
    assert.ok(found.some((line) => /goal "G9" does not exist/.test(line)))
    assert.ok(found.some((line) => /evidence "I9" does not exist/.test(line)))
    assert.ok(
      found.some((line) => /superseded_by "D9" does not exist/.test(line)),
    )
  })
})

test('a superseded Decision without superseded_by fails', () => {
  withRoot((root) => {
    seed(root)
    write(root, 'decisions', 'D2-no-successor.md', {
      id: 'D2',
      title: 'No successor',
      date: '2026-09-01',
      owner: 'Orchestrator',
      status: 'superseded',
      goal: 'G1',
      evidence: ['I1'],
    })
    const found = problems(loadConcept(root))
    assert.ok(found.some((line) => /needs "superseded_by"/.test(line)))
  })
})
