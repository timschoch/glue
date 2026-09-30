import type { GithubClient, IssueInput } from '../github/client.ts'

// Records every issue it opens and answers with its address, like GitHub.
export function createFakeGithub() {
  const issues: { repository: string; issue: IssueInput }[] = []
  const github: GithubClient = {
    createIssue: async (repository, issue) => {
      issues.push({ repository, issue })
      return `https://github.com/${repository}/issues/${issues.length}`
    },
  }
  return { github, issues }
}

export const failingGithub: GithubClient = {
  createIssue: () => Promise.reject(new Error('GitHub answered 503')),
}
