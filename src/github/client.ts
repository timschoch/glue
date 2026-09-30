// GitHub over its REST API. Glue writes issues to the repository of a
// Product. Tests use a fake with the same shape.
import { getSetting } from '../settings.server.ts'

export type IssueInput = { title: string; body: string; labels: string[] }

export type GithubClient = {
  // Opens an issue and returns its web address.
  createIssue: (repository: string, issue: IssueInput) => Promise<string>
}

const API_URL = 'https://api.github.com'
const NOT_FOUND = 404
// A new label takes the colour GitHub shows for ready work.
const LABEL_COLOR = '0e8a16'

export function createGithubClient(): GithubClient {
  async function fetchGithub(path: string, init: RequestInit = {}) {
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${getSetting('GITHUB_TOKEN')}`,
        'content-type': 'application/json',
        'user-agent': 'glue',
        'x-github-api-version': '2022-11-28',
      },
    })
  }

  async function validateResponse(response: Response, action: string) {
    if (response.ok) return
    const detail = await response.text()
    throw new Error(`GitHub ${action}: ${response.status} ${detail}`)
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
  }
}
