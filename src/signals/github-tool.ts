// The Integration tool for GitHub: the address is a repository and the key
// is a token of the team. Its Signals are the Signals of the GitHub source.
import { IntegrationReadError } from '../db/integrations.ts'
import type { IntegrationTool } from '../db/integrations.ts'
import { GithubError } from '../github/client.ts'
import type { GithubClient } from '../github/client.ts'
import { listGithubSignals } from './github-source.ts'

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/

const UNAUTHORIZED = 401
const FORBIDDEN = 403
const NOT_FOUND = 404

// What the member changes after GitHub refused the read.
function toReadError(error: unknown, repository: string) {
  if (!(error instanceof GithubError)) return error
  if (error.status === UNAUTHORIZED)
    return new IntegrationReadError('GitHub refused the key', 'key')
  if (error.status === FORBIDDEN)
    return new IntegrationReadError(
      `The key cannot read the issues of "${repository}"`,
      'key',
    )
  if (error.status === NOT_FOUND)
    return new IntegrationReadError(
      `GitHub has no repository "${repository}" that the key can read`,
      'address',
    )
  return error
}

// `createClient` gives GitHub with the key of the team as its token.
export function createGithubTool(
  createClient: (key: string) => GithubClient,
): IntegrationTool {
  return {
    findAddressProblem: (address) =>
      REPOSITORY.test(address)
        ? undefined
        : 'A repository is owner/name, for example acme/shop',
    listSignals: async (repository, key) => {
      try {
        return await listGithubSignals(createClient(key), repository)
      } catch (error) {
        throw toReadError(error, repository)
      }
    },
  }
}
