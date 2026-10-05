import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findContractLine,
  isBotBranch,
  problems,
} from './check-pr-workflow.mjs'

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

test('a Decision of another Project passes as <project>/<id>', () => {
  const found = problems({
    body: 'Closes #12\nDecision: D2, glue/D12',
    files: [],
    decisions: new Map([...decisions, ['glue/D12', { status: 'accepted' }]]),
  })
  assert.deepEqual(found, [])
})

test('an unknown Decision of another Project fails, naming it with its Project', () => {
  const [found] = problems({
    body: 'Closes #12\nDecision: glue/D2',
    files: [],
    decisions,
  })
  assert.match(found, /Decision "glue\/D2" does not exist/)
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

test('a sunk Decision without a successor fails, and names no replacement', () => {
  const withSunk = new Map(decisions).set('D7', {
    status: 'superseded',
    superseded_by: null,
  })
  const [found] = problems({
    body: 'Closes #12\nDecision: D7',
    files: [],
    decisions: withSunk,
  })
  assert.match(found, /Decision "D7" is sunk and has no successor/)
  assert.doesNotMatch(found, /undefined|null/)
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

test('a Contract line with the newest Version passes in place of a Decision line', () => {
  assert.deepEqual(
    problems({
      body: 'Closes #12\n\nContract: videos@2',
      files: [],
      decisions,
      contract: { concept: 'videos', newestVersion: 2 },
    }),
    [],
  )
})

test('a Contract line with an older Version fails and names the newest one', () => {
  const [found] = problems({
    body: 'Closes #12\nContract: videos@1',
    files: [],
    decisions,
    contract: { concept: 'videos', newestVersion: 2 },
  })
  assert.match(found, /videos@1/)
  assert.match(found, /videos@2/)
})

test('a Contract line of a Concept without a Contract Version fails', () => {
  const [found] = problems({
    body: 'Closes #12\nContract: videos@1',
    files: [],
    decisions,
    contract: { concept: 'videos', newestVersion: undefined },
  })
  assert.match(found, /"videos" has no Contract Version/)
})

test('a Contract line without <concept>@<version> fails', () => {
  const [found] = problems({
    body: 'Closes #12\nContract: videos',
    files: [],
    decisions,
  })
  assert.match(found, /Contract: <concept>@<version>/)
})

test('findContractLine reads the Concept and the Version of the line', () => {
  assert.deepEqual(findContractLine('Closes #1\nContract: part-model@12'), {
    concept: 'part-model',
    version: 12,
  })
  assert.equal(findContractLine('Closes #1\nDecision: D2'), undefined)
  assert.equal(findContractLine('Contract: videos'), null)
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

test('bot branches skip the gate, the skilly update branch too', () => {
  for (const ref of [
    'dependabot/npm_and_yarn/eslint-10.11.0',
    'renovate/vite-8.x',
    'release-please--branches--main',
    'skilly/update',
    'chore/skilly-update',
  ]) {
    assert.equal(isBotBranch(ref), true, ref)
  }
  assert.equal(isBotBranch('chore/skilly-update-by-hand'), false)
  assert.equal(isBotBranch('feat/goal-progress-ui'), false)
})
