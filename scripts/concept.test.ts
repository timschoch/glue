import { describe, expect, it } from 'vitest'

import { parseFlags } from './concept.ts'

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

  it('rejects an unknown flag', () => {
    expect(() => parseFlags(['--titel', 'x'])).toThrow(/unknown flag "--titel"/)
  })

  it('rejects a flag with no value', () => {
    expect(() => parseFlags(['--evidence'])).toThrow(
      /"--evidence" needs a value/,
    )
  })
})
