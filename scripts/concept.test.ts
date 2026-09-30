import { describe, expect, it } from 'vitest'

import { formatDownstreamIssue, parseFlags } from './concept.ts'

describe('parseFlags', () => {
  it('parses a flag into its field', () => {
    expect(parseFlags(['--title', 'Ship faster'])).toEqual({
      title: 'Ship faster',
    })
  })

  it('maps a kebab-case flag to its snake_case field', () => {
    expect(parseFlags(['--enforced-by', 'none yet'])).toEqual({
      enforced_by: 'none yet',
    })
    expect(parseFlags(['--superseded-by', 'D2'])).toEqual({
      superseded_by: 'D2',
    })
  })

  it('parses the Decision that a new Decision supersedes', () => {
    expect(parseFlags(['--supersedes', 'D1'])).toEqual({ supersedes: 'D1' })
  })

  it('splits --evidence on commas', () => {
    expect(parseFlags(['--evidence', 'I1,F1'])).toEqual({
      evidence: ['I1', 'F1'],
    })
  })

  it('parses the --name of a token', () => {
    expect(parseFlags(['--product', 'flexibeck', '--name', 'bot'])).toEqual({
      product: 'flexibeck',
      name: 'bot',
    })
  })

  it('parses the --analytics-project of a Product', () => {
    expect(parseFlags(['--analytics-project', 'phc_demo'])).toEqual({
      analytics_project: 'phc_demo',
    })
  })

  it('parses --measure as the JSON of a Goal measure', () => {
    const measure = {
      source: 'mock-analytics',
      steps: ['signed-up', 'paid'],
      target: 0.25,
      window_days: 7,
    }

    expect(parseFlags(['--measure', JSON.stringify(measure)])).toEqual({
      measure,
    })
  })

  it('rejects a --measure that is not JSON', () => {
    expect(() => parseFlags(['--measure', '{target: 1}'])).toThrow(
      /"--measure" must be JSON/,
    )
  })

  it('rejects a --measure without its steps', () => {
    const measure = { source: 'mock-analytics', target: 0.25 }

    expect(() => parseFlags(['--measure', JSON.stringify(measure)])).toThrow(
      /steps/,
    )
  })

  it('parses the --repository of a Product', () => {
    expect(parseFlags(['--repository', 'timschoch/glue'])).toEqual({
      repository: 'timschoch/glue',
    })
  })

  it('rejects an unknown flag', () => {
    expect(() => parseFlags(['--titel', 'x'])).toThrow(/unknown flag "--titel"/)
  })

  it('rejects a flag with no value', () => {
    expect(() => parseFlags(['--evidence'])).toThrow(
      /"--evidence" needs a value/,
    )
  })
})

describe('formatDownstreamIssue', () => {
  it('names the issue that was opened', () => {
    expect(
      formatDownstreamIssue('flexibeck', 'D2', {
        kind: 'created',
        url: 'https://github.com/timschoch/glue/issues/9',
      }),
    ).toBe('issue: https://github.com/timschoch/glue/issues/9')
  })

  it('says the issue is missing and how to retry', () => {
    expect(
      formatDownstreamIssue('flexibeck', 'D2', {
        kind: 'failed',
        message: 'GitHub create issue: 403',
      }),
    ).toBe(
      'issue missing: GitHub create issue: 403\nRetry: pnpm concept downstream D2 --product flexibeck',
    )
  })

  it('says why no issue was opened', () => {
    expect(
      formatDownstreamIssue('flexibeck', 'D2', { kind: 'no-repository' }),
    ).toBe('no issue: the Product has no repository')
    expect(
      formatDownstreamIssue('flexibeck', 'D2', { kind: 'not-accepted' }),
    ).toBe('no issue: D2 is not accepted')
  })
})
