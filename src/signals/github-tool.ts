// The Integration tool for GitHub: the address is a repository and the key
// is a token of the team. Its Signals are the Signals of the GitHub source.
import {
  IntegrationLimitError,
  IntegrationReadError,
} from '../db/integrations.ts'
import type { ReadTool } from '../db/integrations.ts'
import { GithubError, createGithubClient } from '../github/client.ts'
import type { GithubClient } from '../github/client.ts'
import { listGithubSignals } from './github-source.ts'

// A part with dots only is a step in a path, not a name: "../.." would
// read another address of GitHub.
const REPOSITORY = /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/

const UNAUTHORIZED = 401
const FORBIDDEN = 403
const NOT_FOUND = 404

// What the member changes after GitHub refused the read. A rate limit
// goes away with no change: it names no place.
function toReadError(error: unknown, repository: string) {
  if (!(error instanceof GithubError)) return error
  if (error.isRateLimited)
    return new IntegrationLimitError(
      'GitHub limits the reads with this key for now. A later read works again.',
    )
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

// `createClient` gives GitHub with the key of the team as its token. A test
// gives a fake one.
export function createGithubTool(
  createClient: (key: string) => GithubClient = (key) =>
    createGithubClient(() => key),
): ReadTool {
  return {
    label: 'GitHub',
    addressFields: [{ label: 'Repository' }],
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
