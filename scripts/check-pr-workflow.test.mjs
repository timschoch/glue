import assert from 'node:assert/strict'
import { test } from 'node:test'
import { problems } from './check-pr-workflow.mjs'

const decisions = new Map([
  ['D2', { status: 'proposed' }],
  ['D9', { status: 'superseded', superseded_by: 'D10' }],
])
const body = 'Closes #12\n\nDecision: D2'

test('a complete PR passes', () => {
  assert.deepEqual(
    problems({
      body,
      files: ['src/lib/why.ts', 'src/lib/why.test.ts'],
      decisions,
    }),
    [],
  )
})

test('needs an issue link and a Decision id that exists', () => {
  const found = problems({
    body: 'Adds the why view',
    files: ['README.md'],
    decisions,
  })
  assert.equal(found.length, 2)
  assert.match(found[0], /Closes #/)
  assert.match(found[1], /Decision:/)
})

test('a Decision line without an id fails', () => {
  const [found] = problems({
    body: 'Closes #12\nDecision: none, workflow tooling',
    files: [],
    decisions,
  })
  assert.match(found, /at least one Decision id/)
})

test('an unknown Decision id fails, naming it and where to list them', () => {
  const [found] = problems({
    body: 'Closes #12\nDecision: D99',
    files: [],
    decisions,
  })
  assert.match(found, /D99/)
  assert.match(found, /pnpm concept list decisions/)
})

test('a superseded Decision fails with a hint to its replacement', () => {
  const [found] = problems({
    body: 'Closes #12\nDecision: D9',
    files: [],
    decisions,
  })
  assert.match(found, /D9/)
  assert.match(found, /D10/)
})

test('a PR may cite a Decision it adds itself', () => {
  const withNew = new Map(decisions).set('D42', { status: 'proposed' })
  assert.deepEqual(
    problems({
      body: 'Closes #12\nDecision: D42',
      files: ['docs/adr/0042-new.md'],
      decisions: withNew,
    }),
    [],
  )
})

test('source changes need tests or a reason', () => {
  const [found] = problems({ body, files: ['src/routes/why.tsx'], decisions })
  assert.match(found, /src\/routes\/why\.tsx/)
  assert.deepEqual(
    problems({
      body: `${body}\nNo-test-reason: copy change only`,
      files: ['src/routes/why.tsx'],
      decisions,
    }),
    [],
  )
  assert.deepEqual(
    problems({
      body,
      files: ['src/routes/why.tsx', 'e2e/why.spec.ts'],
      decisions,
    }),
    [],
  )
})

test('generated files and styles need no test', () => {
  assert.deepEqual(
    problems({
      body,
      files: ['src/routeTree.gen.ts', 'src/styles.css'],
      decisions,
    }),
    [],
  )
})
