// The Signal source for GitHub: the issues with the label `user-feedback`
// in the repository of the Project.
import type { SignalSource } from '../db/signals.ts'
import type { GithubClient } from '../github/client.ts'

export const SIGNAL_LABEL = 'user-feedback'

export function createGithubSource(github: GithubClient): SignalSource {
  return {
    name: 'github',
    listSignals: async ({ repository }) => {
      if (!repository) return []
      const issues = await github.listIssues(repository, SIGNAL_LABEL)
      return issues.map(({ url, title, body, createdAt }) => ({
        url,
        title,
        text: body,
        date: createdAt.slice(0, 'yyyy-mm-dd'.length),
      }))
    },
  }
}
