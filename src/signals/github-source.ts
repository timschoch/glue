// The Signal source for GitHub: the issues with the label `user-feedback`
// in the repository of the Project.
import type { SignalSource, SourceSignal } from '../db/signals.ts'
import type { GithubClient } from '../github/client.ts'

export const SIGNAL_LABEL = 'user-feedback'

// The Signals of one repository. The Integration tool for GitHub reads a
// repository of a team with it.
export async function listGithubSignals(
  github: GithubClient,
  repository: string,
): Promise<SourceSignal[]> {
  const issues = await github.listIssues(repository, SIGNAL_LABEL)
  return issues.map(({ url, title, body, createdAt }) => ({
    url,
    title,
    text: body,
    date: createdAt.slice(0, 'yyyy-mm-dd'.length),
  }))
}

export function createGithubSource(github: GithubClient): SignalSource {
  return {
    name: 'github',
    listSignals: async ({ repository }) =>
      repository ? listGithubSignals(github, repository) : [],
  }
}
