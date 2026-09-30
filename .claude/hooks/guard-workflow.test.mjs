import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  fileProblem,
  mergedPrNumber,
  mergeProblem,
  readRole,
  shellProblem,
} from './guard-workflow.mjs'

const greenPr = {
  headRefName: 'feat/why-view',
  files: ['src/lib/concept.ts'],
  comments: [],
  commits: [
    {
      committedDate: '2026-09-29T10:00:00Z',
      isMerge: false,
      files: ['src/routes/why.tsx'],
    },
  ],
  checks: [{ name: 'verify', bucket: 'pass' }],
}
const noPr = () => assert.fail('no PR lookup expected')

test('finds the merged PR number', () => {
  assert.equal(mergedPrNumber('gh pr merge 12 --squash'), '12')
  assert.equal(mergedPrNumber('gh pr merge --squash'), 'current')
  assert.equal(mergedPrNumber('cd x && gh pr merge #7'), '7')
  assert.equal(mergedPrNumber('gh pr view 12'), null)
})

test('blocks skipped git hooks, per command', () => {
  assert.match(shellProblem('git commit -n -m x', 'human', noPr), /gate/)
  assert.match(shellProblem('git push --no-verify', 'worker', noPr), /gate/)
  assert.equal(
    shellProblem('git commit -m x && git log -n 3', 'worker', noPr),
    null,
  )
})

test('merge gate', () => {
  assert.match(
    mergeProblem({ role: 'worker', pr: greenPr }),
    /Workers never merge/,
  )
  assert.equal(mergeProblem({ role: 'orchestrator', pr: greenPr }), null)
  assert.match(
    mergeProblem({
      role: 'orchestrator',
      pr: { ...greenPr, headRefName: 'release-please--branches--main' },
    }),
    /Only the user/,
  )
  const red = { ...greenPr, checks: [{ name: 'verify', bucket: 'fail' }] }
  assert.match(
    mergeProblem({ role: 'orchestrator', pr: red }),
    /verify \(fail\)/,
  )
  assert.match(
    mergeProblem({ role: 'orchestrator', pr: { ...greenPr, checks: [] } }),
    /none reported/,
  )
})

test('UI changes need a fresh interface-review Approve', () => {
  const ui = { ...greenPr, files: ['src/routes/why.tsx'] }
  const comment = (body, createdAt) => ({ body, createdAt })
  assert.match(
    mergeProblem({ role: 'orchestrator', pr: ui }),
    /without an interface-review verdict/,
  )
  const stale = {
    ...ui,
    comments: [comment('interface-review: Approve', '2026-09-29T09:00:00Z')],
  }
  assert.match(
    mergeProblem({ role: 'orchestrator', pr: stale }),
    /UI changed after the interface-review verdict/,
  )
  const blocked = {
    ...ui,
    comments: [comment('interface-review: Block', '2026-09-29T11:00:00Z')],
  }
  assert.match(
    mergeProblem({ role: 'orchestrator', pr: blocked }),
    /said Block/,
  )
  const approved = {
    ...ui,
    comments: [
      ...blocked.comments,
      comment('interface-review: Approve', '2026-09-29T12:00:00Z'),
    ],
  }
  assert.equal(mergeProblem({ role: 'orchestrator', pr: approved }), null)
})

test('a test file is not a UI change', () => {
  const testOnly = {
    ...greenPr,
    files: ['src/components/records/record-view.test.tsx'],
  }
  assert.equal(mergeProblem({ role: 'orchestrator', pr: testOnly }), null)
})

test('an interface-review verdict holds until a UI file changes after it', () => {
  const commit = (committedDate, files, isMerge = false) => ({
    committedDate,
    files,
    isMerge,
  })
  const approvedAt10 = {
    ...greenPr,
    files: ['src/routes/why.tsx', 'src/db/concept.ts'],
    comments: [
      { body: 'interface-review: Approve', createdAt: '2026-09-29T10:30:00Z' },
    ],
  }
  const later = (...commits) => ({
    ...approvedAt10,
    commits: [...approvedAt10.commits, ...commits],
  })
  assert.equal(
    mergeProblem({
      role: 'orchestrator',
      pr: later(commit('2026-09-29T11:00:00Z', ['src/db/concept.ts'])),
    }),
    null,
  )
  assert.equal(
    mergeProblem({
      role: 'orchestrator',
      pr: later(commit('2026-09-29T11:00:00Z', ['src/other.tsx'], true)),
    }),
    null,
    'a merge of main brings reviewed UI code, not new PR code',
  )
  assert.match(
    mergeProblem({
      role: 'orchestrator',
      pr: later(commit('2026-09-29T11:00:00Z', ['src/routes/why.tsx'])),
    }),
    /UI changed after the interface-review verdict/,
  )
  const blockedThenBackend = {
    ...later(commit('2026-09-29T11:00:00Z', ['src/db/concept.ts'])),
    comments: [
      { body: 'interface-review: Block', createdAt: '2026-09-29T10:30:00Z' },
    ],
  }
  assert.match(
    mergeProblem({ role: 'orchestrator', pr: blockedThenBackend }),
    /said Block/,
  )
})

test('workers keep out of workflow files', () => {
  const root = '/repo'
  assert.match(fileProblem('/repo/CLAUDE.md', root, 'worker'), /CLAUDE\.md/)
  assert.match(
    fileProblem('.github/workflows/ci.yml', root, 'worker'),
    /ci\.yml/,
  )
  assert.match(
    fileProblem('/repo/.agents/skills/t3-threads/SKILL.md', root, 'worker'),
    /SKILL/,
  )
  assert.equal(fileProblem('/repo/src/routes/why.tsx', root, 'worker'), null)
  assert.equal(fileProblem('/repo/CLAUDE.md', root, 'orchestrator'), null)
  assert.equal(fileProblem('/repo/CLAUDE.md', root, 'human'), null)
})

test('reads the role from .temp/role', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'))
  assert.equal(readRole(root), 'human')
  mkdirSync(join(root, '.temp'))
  writeFileSync(join(root, '.temp', 'role'), 'worker\n')
  assert.equal(readRole(root), 'worker')
})

test('hook: exit 2 on block, override is logged', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'))
  const hook = (command) =>
    spawnSync(
      'node',
      [new URL('./guard-workflow.mjs', import.meta.url).pathname],
      {
        input: JSON.stringify({ tool_input: { command }, cwd: root }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        encoding: 'utf8',
      },
    )
  const blocked = hook('git commit --no-verify -m x')
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /GLUE_OVERRIDE/)
  const overridden = hook(
    'GLUE_OVERRIDE="hook crashes on node 26" git commit --no-verify -m x',
  )
  assert.equal(overridden.status, 0)
  const log = JSON.parse(
    readFileSync(join(root, '.temp', 'overrides.jsonl'), 'utf8'),
  )
  assert.equal(log.reason, 'hook crashes on node 26')
  assert.equal(hook('git status').status, 0)
})
