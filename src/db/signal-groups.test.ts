import { describe, expect, it } from 'vitest'

import { groupSignals } from './signal-groups.ts'
import type { Signal } from './signals.ts'

const slow: Signal = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  text: 'It takes five seconds to open the list.',
  date: '2026-10-02',
  source: 'github',
  insight: null,
}
const slowAgain: Signal = {
  url: 'https://github.com/timschoch/glue/issues/9',
  title: 'Slow list of Parts',
  text: 'The list opens after a long time.',
  date: '2026-10-01',
  source: 'github',
  insight: null,
}
const slowTicket: Signal = {
  url: 'https://support.test/agent/tickets/4',
  title: 'The list of Parts is slow',
  text: 'I wait a long time until the list is open.',
  date: '2026-09-30',
  source: 'support',
  insight: null,
}
const refund: Signal = {
  url: 'https://support.test/agent/tickets/3',
  title: 'Where is my refund?',
  text: 'I asked two weeks ago.',
  date: '2026-09-29',
  source: 'support',
  insight: null,
}

describe('groupSignals', () => {
  it('puts the Signals that say the same thing into one group', () => {
    expect(groupSignals([slow, slowAgain, refund])).toEqual([
      { signals: [slow.url, slowAgain.url], sources: ['github'] },
    ])
  })

  it('makes no group of Signals that say different things', () => {
    expect(groupSignals([slow, refund])).toEqual([])
  })

  it('names each source of a group one time', () => {
    expect(groupSignals([slow, slowAgain, slowTicket, refund])).toEqual([
      {
        signals: [slow.url, slowAgain.url, slowTicket.url],
        sources: ['github', 'support'],
      },
    ])
  })

  it('leaves out a Signal that grew into an Insight', () => {
    const grown = { ...slowAgain, insight: { id: 'I1', title: 'Slow lists' } }

    expect(groupSignals([slow, grown, slowTicket])).toEqual([
      { signals: [slow.url, slowTicket.url], sources: ['github', 'support'] },
    ])
    expect(groupSignals([slow, grown])).toEqual([])
  })

  it('makes no group of the survey answers that share only their title', () => {
    const hard = {
      url: 'https://analytics.test/events/1',
      title: 'Survey answer 2 of 7',
      text: 'Too hard',
      date: '2026-10-01',
      source: 'analytics',
      insight: null,
    }
    const lost = { ...hard, url: 'https://analytics.test/events/2', text: '' }

    expect(groupSignals([hard, lost])).toEqual([])
  })

  it('takes a word that many Signals of the Project share as no key word', () => {
    const titled = [
      'Export a Concept of the Project as PDF',
      'Rename a Project and its Concept tree',
      'Project owner cannot delete a Concept',
      'Share a Concept with another Project',
      'Archive the Concept of an old Project',
      'Copy a Project with each Concept',
    ].map((title, index) => ({
      ...refund,
      url: `https://github.com/timschoch/glue/issues/${index + 20}`,
      title,
      text: '',
    }))

    expect(groupSignals([...titled, slow, slowAgain])).toEqual([
      { signals: [slow.url, slowAgain.url], sources: ['github'] },
    ])
  })

  it('puts two Signals with the same title into one group, also with one key word', () => {
    const hard = { ...refund, title: 'Too hard', text: '' }
    const hardAgain = {
      ...hard,
      url: 'https://github.com/timschoch/glue/issues/11',
      title: 'too  hard',
      source: 'github',
    }
    const find = {
      ...hard,
      url: 'https://support.test/agent/tickets/8',
      title: 'Hard to find',
    }

    expect(groupSignals([hard, hardAgain, find])).toEqual([
      { signals: [hard.url, hardAgain.url], sources: ['support', 'github'] },
    ])
  })

  it('makes no chain: each Signal of a group says the same as each other one', () => {
    const [search, both, invoice] = [
      'Slow search results',
      'Slow search in the export of an invoice',
      'Export an invoice as PDF',
    ].map((title, index) => ({
      ...refund,
      url: `https://github.com/timschoch/glue/issues/${index + 30}`,
      title,
      text: '',
    }))

    expect(groupSignals([search, both, invoice])).toEqual([
      { signals: [search.url, both.url], sources: ['support'] },
    ])
  })

  it('groups 5000 Signals in less than a second', () => {
    // A word of letters for each number, and 12 of 2000 words for each Signal.
    const toWord = (value: number) =>
      [...String(value).padStart(4, '0')]
        .map(
          (digit) => 'bdfgklmnpr'[Number(digit)] + 'aeiou'[Number(digit) % 5],
        )
        .join('')
    const many = Array.from({ length: 5000 }, (_, index) => ({
      ...refund,
      url: `https://github.com/timschoch/glue/issues/${index + 100}`,
      title: [1, 2, 3, 4]
        .map((step) => toWord((index * step * 7919) % 2000))
        .join(' '),
      text: [5, 6, 7, 8, 9, 10, 11, 12]
        .map((step) => toWord((index * step * 104729) % 2000))
        .join(' '),
    }))
    const start = performance.now()

    groupSignals(many)

    expect(performance.now() - start).toBeLessThan(1000)
  })
})
