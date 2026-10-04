import type { GithubClient, Issue, IssueInput } from '../github/client.ts'

// Records every issue it opens and answers with its address, like GitHub.
// It lists `labelled` for each label, and records what it was asked for.
export function createFakeGithub(labelled: Issue[] = []) {
  const issues: { repository: string; issue: IssueInput }[] = []
  const listed: { repository: string; label: string }[] = []
  const github: GithubClient = {
    listIssues: async (repository, label) => {
      listed.push({ repository, label })
      return labelled
    },
    createIssue: async (repository, issue) => {
      issues.push({ repository, issue })
      return `https://github.com/${repository}/issues/${issues.length}`
    },
  }
  return { github, issues, listed }
}

export const failingGithub: GithubClient = {
  createIssue: () => Promise.reject(new Error('GitHub answered 503')),
  listIssues: () => Promise.reject(new Error('GitHub answered 503')),
}
