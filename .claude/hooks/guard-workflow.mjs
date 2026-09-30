// Claude Code PreToolUse hook: holds agents to the run rules in CLAUDE.md.
// Shell tools: blocks --no-verify, and gates `gh pr merge` behind role,
// required checks and an interface-review Approve. File tools: keeps workers
// out of the files that define the workflow.
// Escape hatch for shell commands: put GLUE_OVERRIDE="<reason>" in the command.
// The override is allowed and logged to .temp/overrides.jsonl.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// Files a worker must not change: the workflow itself.
export const PROTECTED = [
  /^CLAUDE\.md$/,
  /^\.claude\//,
  /^\.github\//,
  /^\.husky\//,
  /^\.skilly\//,
  /^\.agents\/skills\//,
]
// A change to these files is a UI change: interface-review must approve it.
export const UI_FILE = /^src\/(?!.*\.test\.tsx$).*\.(tsx|css)$/
const RELEASE_BRANCH = 'release-please--'
const REVIEW_MARKER = /interface-review:\s*(Approve|Block)/i

// A worktree without .temp/role is a human-led session: role rules do not apply.
export function readRole(root) {
  const file = join(root, '.temp', 'role')
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : 'human'
}

const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

export function mergedPrNumber(command) {
  const match = command.match(/(?:^|[;&|]\s*)gh\s+pr\s+merge\b([^;&|]*)/)
  if (!match) return null
  const number = match[1].match(/(?:^|\s)#?(\d+)(?=\s|$)/)
  return number ? number[1] : 'current'
}

// Returns a reason to block the merge, or null.
export function mergeProblem({ role, pr }) {
  if (role === 'worker')
    return 'Workers never merge. Report RESULT: done <PR URL> to the orchestrator.'
  if (pr.headRefName.startsWith(RELEASE_BRANCH))
    return 'The release PR deploys production. Only the user merges it.'
  const failing = pr.checks.filter((check) => check.bucket !== 'pass')
  if (pr.checks.length === 0 || failing.length > 0) {
    const names = failing
      .map((check) => `${check.name} (${check.bucket})`)
      .join(', ')
    return `Required checks are not green: ${names || 'none reported yet'}.`
  }
  if (!pr.files.some((file) => UI_FILE.test(file))) return null
  const review = lastReview(pr.comments)
  if (!review)
    return 'UI change without an interface-review verdict. Run interface-review, then comment "interface-review: Approve" on the PR.'
  // A merge of main brings UI code that its own PR had reviewed.
  const uiChangedAfter = pr.commits.some(
    (commit) =>
      !commit.isMerge &&
      new Date(commit.committedDate) > new Date(review.createdAt) &&
      commit.files.some((file) => UI_FILE.test(file)),
  )
  if (uiChangedAfter)
    return 'UI changed after the interface-review verdict. Run interface-review again, then comment the new verdict on the PR.'
  if (review.verdict.toLowerCase() === 'approve') return null
  return 'interface-review said Block. Send the findings to the worker.'
}

function lastReview(comments) {
  return comments
    .map((comment) => ({
      createdAt: comment.createdAt,
      verdict: comment.body.match(REVIEW_MARKER)?.[1],
    }))
    .filter((review) => review.verdict)
    .at(-1)
}

function loadPr(number, cwd) {
  const target = number === 'current' ? [] : [number]
  const view = JSON.parse(
    run(
      'gh',
      ['pr', 'view', ...target, '--json', 'headRefName,files,comments,commits'],
      cwd,
    ),
  )
  let checks = []
  try {
    checks = JSON.parse(
      run(
        'gh',
        ['pr', 'checks', ...target, '--required', '--json', 'name,bucket'],
        cwd,
      ),
    )
  } catch (error) {
    // gh exits non-zero while checks fail or pend, but still prints the JSON.
    checks = JSON.parse(error.stdout || '[]')
  }
  const reviewedAt = lastReview(view.comments)?.createdAt ?? 0
  return {
    headRefName: view.headRefName,
    files: view.files.map((file) => file.path),
    comments: view.comments,
    commits: view.commits.map((commit) =>
      new Date(commit.committedDate) > new Date(reviewedAt)
        ? loadCommit(commit, cwd)
        : { committedDate: commit.committedDate, isMerge: false, files: [] },
    ),
    checks,
  }
}

// Only commits after the last verdict are loaded: one API call each.
function loadCommit({ oid, committedDate }, cwd) {
  const detail = JSON.parse(
    run('gh', ['api', `repos/{owner}/{repo}/commits/${oid}`], cwd),
  )
  return {
    committedDate,
    isMerge: detail.parents.length > 1,
    files: detail.files.map((file) => file.filename),
  }
}

export function shellProblem(command, role, loadMergedPr) {
  const segments = command.split(/[;&|]+/)
  if (
    segments.some(
      (part) =>
        /\bgit\s+(commit|push)\b/.test(part) &&
        /\s(--no-verify|-n)(\s|$)/.test(part),
    )
  ) {
    return 'The git hooks are the gate. Fix what they report instead of skipping them.'
  }
  const number = mergedPrNumber(command)
  return number ? mergeProblem({ role, pr: loadMergedPr(number) }) : null
}

export function fileProblem(path, root, role) {
  if (role !== 'worker') return null
  const file = relative(root, resolve(root, path))
  if (!PROTECTED.some((pattern) => pattern.test(file))) return null
  return `Workers do not change the workflow (${file}). Report RESULT: question <the change you need> to the orchestrator.`
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const tool = input.tool_input ?? {}
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const role = readRole(root)
  const command = tool.command
  const path = tool.file_path ?? tool.path ?? tool.arguments?.path

  let problem = null
  if (typeof command === 'string') {
    problem = shellProblem(command, role, (number) =>
      loadPr(number, tool.cwd || input.cwd || root),
    )
    const override = command.match(/GLUE_OVERRIDE=["']([^"']+)["']/)
    if (problem && override) {
      mkdirSync(join(root, '.temp'), { recursive: true })
      const entry = {
        at: new Date().toISOString(),
        role,
        command,
        reason: override[1],
        problem,
      }
      appendFileSync(
        join(root, '.temp', 'overrides.jsonl'),
        `${JSON.stringify(entry)}\n`,
      )
      return
    }
  } else if (typeof path === 'string') {
    problem = fileProblem(path, root, role)
  }
  if (!problem) return

  console.error(`BLOCKED by guard-workflow: ${problem}`)
  if (typeof command === 'string') {
    console.error(
      'Deliberate skip: add GLUE_OVERRIDE="<reason>" to the command. It is logged and reported.',
    )
  }
  process.exit(2)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
