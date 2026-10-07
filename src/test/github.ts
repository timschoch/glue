import type {
  CheckRun,
  GithubClient,
  Issue,
  IssueInput,
  PullRequest,
} from '../github/client.ts'

// Records every issue it opens and answers with its address, like GitHub.
// It lists `labelled` for each label, `pullRequests` for each repository and
// `checkRuns` for each pull request, and records what it was asked for.
export function createFakeGithub(
  labelled: Issue[] = [],
  pullRequests: PullRequest[] = [],
  checkRuns: CheckRun[] = [],
) {
  const issues: { repository: string; issue: IssueInput }[] = []
  const listed: { repository: string; label: string }[] = []
  const pullRequestsListed: string[] = []
  const pullRequestsSearched: { repository: string; text: string }[] = []
  const checkRunsListed: { repository: string; number: number }[] = []
  const github: GithubClient = {
    listCheckRuns: async (repository, number) => {
      checkRunsListed.push({ repository, number })
      return checkRuns
    },
    listPullRequests: async (repository) => {
      pullRequestsListed.push(repository)
      return pullRequests
    },
    // Like the search of GitHub: each pull request with the text in its body.
    searchPullRequests: async (repository, text) => {
      pullRequestsSearched.push({ repository, text })
      return pullRequests.filter(({ body }) => body.includes(text))
    },
    listIssues: async (repository, label) => {
      listed.push({ repository, label })
      return labelled
    },
    createIssue: async (repository, issue) => {
      issues.push({ repository, issue })
      return `https://github.com/${repository}/issues/${issues.length}`
    },
  }
  return {
    github,
    issues,
    listed,
    pullRequestsListed,
    pullRequestsSearched,
    checkRunsListed,
  }
}

export const failingGithub: GithubClient = {
  createIssue: () => Promise.reject(new Error('GitHub answered 503')),
  listIssues: () => Promise.reject(new Error('GitHub answered 503')),
  listPullRequests: () => Promise.reject(new Error('GitHub answered 503')),
  searchPullRequests: () => Promise.reject(new Error('GitHub answered 503')),
  listCheckRuns: () => Promise.reject(new Error('GitHub answered 503')),
}
