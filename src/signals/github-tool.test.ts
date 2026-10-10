import { describe, expect, it } from 'vitest'

import { IntegrationReadError } from '../db/integrations.ts'
import { GithubError } from '../github/client.ts'
import type { GithubClient } from '../github/client.ts'
import { createFakeGithub } from '../test/github.ts'
import { createGithubTool } from './github-tool.ts'

const issue = {
  url: 'https://github.com/acme/shop/issues/7',
  title: 'The list is slow',
  body: 'It takes five seconds to open.',
  createdAt: '2026-10-02T08:00:00Z',
}

// GitHub that answers each read with this status.
const createRefusingGithub = (status: number): GithubClient => ({
  ...createFakeGithub().github,
  listIssues: () =>
    Promise.reject(new GithubError(`GitHub list issues: ${status}`, status)),
})

describe('createGithubTool', () => {
  it('reads the issues with the label user-feedback of the repository with the key of the team', async () => {
    const fake = createFakeGithub([issue])
    const keys: string[] = []
    const tool = createGithubTool((key) => {
      keys.push(key)
      return fake.github
    })

    const signals = await tool.listSignals('acme/shop', 'key-of-the-team')

    expect(keys).toEqual(['key-of-the-team'])
    expect(fake.listed).toEqual([
      { repository: 'acme/shop', label: 'user-feedback' },
    ])
    expect(signals).toEqual([
      {
        url: 'https://github.com/acme/shop/issues/7',
        title: 'The list is slow',
        text: 'It takes five seconds to open.',
        date: '2026-10-02',
      },
    ])
  })

  it.each([
    [401, 'key', 'GitHub refused the key'],
    [403, 'key', 'The key cannot read the issues of "acme/shop"'],
    [
      404,
      'address',
      'GitHub has no repository "acme/shop" that the key can read',
    ],
  ])(
    'names the place to change when GitHub answers %i: the %s',
    async (status, place, message) => {
      const tool = createGithubTool(() => createRefusingGithub(status))

      const refused = tool.listSignals('acme/shop', 'key-of-the-team')

      await expect(refused).rejects.toThrow(IntegrationReadError)
      await expect(refused).rejects.toMatchObject({ message, place })
    },
  )

  it('keeps another failure of GitHub as it is', async () => {
    const tool = createGithubTool(() => createRefusingGithub(503))

    const failed = tool.listSignals('acme/shop', 'key-of-the-team')

    await expect(failed).rejects.toThrow('GitHub list issues: 503')
    await expect(failed).rejects.not.toThrow(IntegrationReadError)
  })

  it.each(['acme/shop', 'acme-inc/shop.next_2'])(
    'takes the repository %s',
    (address) => {
      const tool = createGithubTool(() => createFakeGithub().github)

      expect(tool.findAddressProblem(address)).toBeUndefined()
    },
  )

  it.each(['shop', 'https://github.com/acme/shop', 'acme/shop/issues'])(
    'refuses the address %s',
    (address) => {
      const tool = createGithubTool(() => createFakeGithub().github)

      expect(tool.findAddressProblem(address)).toBe(
        'A repository is owner/name, for example acme/shop',
      )
    },
  )
})
