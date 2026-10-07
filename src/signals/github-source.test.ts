import { describe, expect, it } from 'vitest'

import { createFakeGithub, failingGithub } from '../test/github.ts'
import { createGithubSource } from './github-source.ts'

const issue = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  body: 'It takes five seconds to open.',
  createdAt: '2026-10-02T08:00:00Z',
}

const glue = {
  repository: 'timschoch/glue',
  analyticsProject: null,
  supportUrl: null,
  socialHandle: null,
  marketUrl: null,
}

describe('createGithubSource', () => {
  it('reads the issues with the label user-feedback of the repository of the Project', async () => {
    const fake = createFakeGithub([issue])

    const signals = await createGithubSource(fake.github).listSignals(glue)

    expect(fake.listed).toEqual([
      { repository: 'timschoch/glue', label: 'user-feedback' },
    ])
    expect(signals).toEqual([
      {
        url: 'https://github.com/timschoch/glue/issues/7',
        title: 'The list is slow',
        text: 'It takes five seconds to open.',
        date: '2026-10-02',
      },
    ])
  })

  it('has the name github', () => {
    expect(createGithubSource(failingGithub).name).toBe('github')
  })

  it('gives no Signal and asks nothing for a Project without a repository', async () => {
    const fake = createFakeGithub([issue])

    const signals = await createGithubSource(fake.github).listSignals({
      ...glue,
      repository: null,
    })

    expect(signals).toEqual([])
    expect(fake.listed).toEqual([])
  })

  it('fails when GitHub fails', async () => {
    await expect(
      createGithubSource(failingGithub).listSignals(glue),
    ).rejects.toThrow('GitHub answered 503')
  })
})
