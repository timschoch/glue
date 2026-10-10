// GitHub over its REST API. Glue writes issues to the repository of a
// Product, and reads the issues that are its Signals. Tests use a fake with
// the same shape.
import { getSetting } from '../settings.server.ts'

export type IssueInput = { title: string; body: string; labels: string[] }

// An issue as Glue reads it: its web address, its title, its text and when
// it was opened.
export type Issue = {
  url: string
  title: string
  body: string
  createdAt: string
}

// A pull request as Glue reads it. One that was closed with no merge is not
// a build, so Glue does not read it.
export type PullRequest = {
  number: number
  url: string
  title: string
  state: 'open' | 'merged'
  body: string
}

// A check on a commit as Glue reads it. Two checks can have one name.
export type CheckRun = { name: string; state: 'passed' | 'failed' | 'waiting' }

export type GithubClient = {
  // Opens an issue and returns its web address.
  createIssue: (repository: string, issue: IssueInput) => Promise<string>
  // The open and the closed issues with the label, the newest first.
  listIssues: (repository: string, label: string) => Promise<Issue[]>
  // The open and the merged pull requests, the newest first.
  listPullRequests: (repository: string) => Promise<PullRequest[]>
  // The open and the merged pull requests with the text in their body, the
  // newest first. One request of the search of GitHub.
  searchPullRequests: (
    repository: string,
    text: string,
  ) => Promise<PullRequest[]>
  // Each check on the head commit of the pull request.
  listCheckRuns: (repository: string, number: number) => Promise<CheckRun[]>
}

const API_URL = 'https://api.github.com'
const NOT_FOUND = 404
// A new label takes the colour GitHub shows for ready work.
const LABEL_COLOR = '0e8a16'
// The most issues, pull requests or checks that GitHub gives in one answer.
const PAGE_SIZE = 100

// GitHub lists pull requests as issues, with the key `pull_request`.
type ListedIssue = {
  html_url: string
  title: string
  body: string | null
  created_at: string
  pull_request?: unknown
}

type ListedPullRequest = {
  number: number
  html_url: string
  title: string
  state: 'open' | 'closed'
  merged_at: string | null
  body: string | null
}

// The search of GitHub gives a pull request as an issue: when it was merged
// is under the key `pull_request`.
type FoundPullRequest = Omit<ListedPullRequest, 'merged_at'> & {
  pull_request: { merged_at: string | null }
}

type ListedCheckRun = {
  name: string
  status: string
  conclusion: string | null
}

// The conclusions of a check that count as passed.
const PASSED = ['success', 'neutral']
// A check that GitHub skipped checked nothing: it waits.
const SKIPPED = 'skipped'

// A pull request that was closed with no merge is not a build.
function toPullRequests(listed: ListedPullRequest[]): PullRequest[] {
  return listed
    .filter((pull) => pull.state === 'open' || pull.merged_at !== null)
    .map((pull) => ({
      number: pull.number,
      url: pull.html_url,
      title: pull.title,
      state: pull.state === 'open' ? 'open' : 'merged',
      body: pull.body ?? '',
    }))
}

// GitHub refused a request. `status` is the status of its answer.
export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

// `getToken` gives the token of each request. With none, it is the token of
// the server.
export function createGithubClient(
  getToken: () => string = () => getSetting('GITHUB_TOKEN'),
): GithubClient {
  async function fetchGithub(path: string, init: RequestInit = {}) {
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${getToken()}`,
        'content-type': 'application/json',
        'user-agent': 'glue',
        'x-github-api-version': '2022-11-28',
      },
    })
  }

  async function validateResponse(response: Response, action: string) {
    if (response.ok) return
    const detail = await response.text()
    throw new GithubError(
      `GitHub ${action}: ${response.status} ${detail}`,
      response.status,
    )
  }

  async function addLabel(repository: string, name: string) {
    const found = await fetchGithub(
      `/repos/${repository}/labels/${encodeURIComponent(name)}`,
    )
    if (found.status !== NOT_FOUND) {
      await validateResponse(found, `read label "${name}"`)
      return
    }
    const created = await fetchGithub(`/repos/${repository}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color: LABEL_COLOR }),
    })
    await validateResponse(created, `create label "${name}"`)
  }

  return {
    createIssue: async (repository, issue) => {
      for (const label of issue.labels) await addLabel(repository, label)
      const response = await fetchGithub(`/repos/${repository}/issues`, {
        method: 'POST',
        body: JSON.stringify(issue),
      })
      await validateResponse(response, 'create issue')
      const created: { html_url: string } = await response.json()
      return created.html_url
    },
    listIssues: async (repository, label) => {
      const query = new URLSearchParams({
        labels: label,
        state: 'all',
        per_page: String(PAGE_SIZE),
      })
      const response = await fetchGithub(`/repos/${repository}/issues?${query}`)
      await validateResponse(response, 'list issues')
      const listed: ListedIssue[] = await response.json()
      return listed
        .filter((issue) => issue.pull_request === undefined)
        .map((issue) => ({
          url: issue.html_url,
          title: issue.title,
          body: issue.body ?? '',
          createdAt: issue.created_at,
        }))
    },
    listPullRequests: async (repository) => {
      const query = new URLSearchParams({
        state: 'all',
        per_page: String(PAGE_SIZE),
      })
      const response = await fetchGithub(`/repos/${repository}/pulls?${query}`)
      await validateResponse(response, 'list pull requests')
      return toPullRequests(await response.json())
    },
    searchPullRequests: async (repository, text) => {
      const query = new URLSearchParams({
        q: `repo:${repository} is:pr in:body "${text}"`,
        sort: 'created',
        order: 'desc',
        per_page: String(PAGE_SIZE),
      })
      const response = await fetchGithub(`/search/issues?${query}`)
      await validateResponse(response, 'search pull requests')
      const found: { items: FoundPullRequest[] } = await response.json()
      return toPullRequests(
        found.items.map(({ pull_request, ...pull }) => ({
          ...pull,
          merged_at: pull_request.merged_at,
        })),
      )
    },
    listCheckRuns: async (repository, number) => {
      const pull = await fetchGithub(`/repos/${repository}/pulls/${number}`)
      await validateResponse(pull, 'read pull request')
      const { head }: { head: { sha: string } } = await pull.json()
      const listed: ListedCheckRun[] = []
      // A page that is not full is the last one.
      for (let page = 1, full = true; full; page += 1) {
        const response = await fetchGithub(
          `/repos/${repository}/commits/${head.sha}/check-runs?per_page=${PAGE_SIZE}&page=${page}`,
        )
        await validateResponse(response, 'list check runs')
        const found: { check_runs: ListedCheckRun[] } = await response.json()
        listed.push(...found.check_runs)
        full = found.check_runs.length === PAGE_SIZE
      }
      return listed.map(({ name, status, conclusion }) => {
        if (status !== 'completed' || conclusion === SKIPPED) {
          return { name, state: 'waiting' }
        }
        const passed = conclusion !== null && PASSED.includes(conclusion)
        return { name, state: passed ? 'passed' : 'failed' }
      })
    },
  }
}
