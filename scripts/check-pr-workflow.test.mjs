import assert from 'node:assert/strict'
import { test } from 'node:test'
import { problems } from './check-pr-workflow.mjs'

const body = 'Closes #12\n\nDecision: D-3 show the why chain first'

test('a complete PR passes', () => {
  assert.deepEqual(
    problems({ body, files: ['src/lib/why.ts', 'src/lib/why.test.ts'] }),
    [],
  )
})

test('needs an issue link and a Decision', () => {
  const found = problems({ body: 'Adds the why view', files: ['README.md'] })
  assert.equal(found.length, 2)
  assert.match(found[0], /Closes #/)
  assert.match(found[1], /Decision:/)
  assert.deepEqual(
    problems({ body: 'Refs #4\nDecision: none, workflow tooling', files: [] }),
    [],
  )
})

test('source changes need tests or a reason', () => {
  const [found] = problems({ body, files: ['src/routes/why.tsx'] })
  assert.match(found, /src\/routes\/why\.tsx/)
  assert.deepEqual(
    problems({
      body: `${body}\nNo-test-reason: copy change only`,
      files: ['src/routes/why.tsx'],
    }),
    [],
  )
  assert.deepEqual(
    problems({ body, files: ['src/routes/why.tsx', 'e2e/why.spec.ts'] }),
    [],
  )
})

test('generated files and styles need no test', () => {
  assert.deepEqual(
    problems({ body, files: ['src/routeTree.gen.ts', 'src/styles.css'] }),
    [],
  )
})
