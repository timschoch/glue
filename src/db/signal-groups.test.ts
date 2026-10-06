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
})
