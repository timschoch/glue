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

// The words of the survey answers in the seed of mock analytics, by score.
const remarks: Record<number, string> = {
  1: 'I could not find where to start',
  2: 'Too many options to pick from',
  3: '',
}

// A survey answer as the analytics source gives it.
function answer(id: number, score: number): Signal {
  return {
    url: `https://analytics.test/events/${id}`,
    title: `Survey answer ${score} of 7`,
    titleBy: 'glue',
    text: remarks[score],
    date: '2026-10-01',
    source: 'analytics',
    insight: null,
  }
}

const pickOption: Signal = {
  url: 'https://github.com/timschoch/glue/issues/146',
  title:
    'A proposed Decision can only be accepted: no way to pick another option or to answer with words',
  text: '',
  date: '2026-10-03',
  source: 'github',
  insight: null,
}
const wrongStatus: Signal = {
  url: 'https://github.com/timschoch/glue/issues/178',
  title:
    'The CLI takes a wrong status for an Insight and cannot clear a status',
  text: 'What I did: `pnpm concept add insights --status confirmed` in the Project `design-system`.\n\nExpected: the CLI refuses the status. An Insight has no status or `draft`.\n\nActual: the CLI saved it. The move to the Part model then failed in the rehearsal on these three rows. I had to clear the status with SQL, because `pnpm concept set` cannot set a field to empty.\n\nWanted: the CLI and the API refuse a status that the type does not have, and `pnpm concept set` can clear a field.\n\nEvidence: I58 of the Project `glue`. The first half is in the scope of #134.',
  date: '2026-10-03',
  source: 'github',
  insight: null,
}
const noProduct: Signal = {
  url: 'https://github.com/timschoch/glue/issues/114',
  title: 'Glue cannot add a Product',
  text: '**Who:** Orchestrator, with `pnpm concept`, 2026-10-03.\n\n**Wanted:** add the Product `design-system` for D33.\n\n**Got:** `pnpm concept product` has `set` only. The app and the HTTP API have no way to add a Product.\n\n**Workaround:** one SQL insert into `products`.',
  date: '2026-10-03',
  source: 'github',
  insight: null,
}

describe('groupSignals', () => {
  it('puts the Signals that say the same thing into one group', () => {
    expect(groupSignals([slow, slowAgain, refund])).toEqual([
      {
        title: slow.title,
        signals: [slow.url, slowAgain.url],
        sources: ['github'],
      },
    ])
  })

  it('gives a group the title of its newest Signal', () => {
    expect(groupSignals([slowAgain, slow])).toMatchObject([
      { title: slow.title, signals: [slowAgain.url, slow.url] },
    ])
  })

  it('gives a group of survey answers the words of the user as its title', () => {
    expect(groupSignals([answer(1, 2), answer(2, 2)])).toMatchObject([
      { title: 'Too many options to pick from' },
    ])
  })

  it('makes no group of Signals that say different things', () => {
    expect(groupSignals([slow, refund])).toEqual([])
  })

  it('names each source of a group one time', () => {
    expect(groupSignals([slow, slowAgain, slowTicket, refund])).toEqual([
      {
        title: slow.title,
        signals: [slow.url, slowAgain.url, slowTicket.url],
        sources: ['github', 'support'],
      },
    ])
  })

  it('leaves out a Signal that grew into an Insight', () => {
    const grown = { ...slowAgain, insight: { id: 'I1', title: 'Slow lists' } }

    expect(groupSignals([slow, grown, slowTicket])).toEqual([
      {
        title: slow.title,
        signals: [slow.url, slowTicket.url],
        sources: ['github', 'support'],
      },
    ])
    expect(groupSignals([slow, grown])).toEqual([])
  })

  it('makes no group of the survey answers that share only their title', () => {
    const lost = { ...answer(1, 2), text: '' }

    expect(groupSignals([answer(2, 2), lost])).toEqual([])
  })

  it('makes no group by a title that Glue gave', () => {
    const [drop, dropAgain] = [1, 2].map((id) => ({
      ...answer(id, 2),
      title: 'Checkout funnel drop',
      text: '',
    }))

    expect(groupSignals([drop, dropAgain])).toEqual([])
  })

  it('puts the survey answers with the same words of the user into one group', () => {
    const hard = { ...answer(1, 2), text: 'Too hard' }
    const hardAgain = { ...answer(2, 3), text: 'too hard' }
    const lost = { ...answer(3, 2), text: 'I got lost' }

    expect(groupSignals([hard, hardAgain, lost])).toEqual([
      {
        title: 'Too hard',
        signals: [hard.url, hardAgain.url],
        sources: ['analytics'],
      },
    ])
  })

  it('makes no group of a short Signal and a long one that holds two of its words', () => {
    expect(groupSignals([answer(1, 2), pickOption])).toEqual([])
  })

  it('makes no group of two Signals that share only words of their texts', () => {
    expect(groupSignals([wrongStatus, noProduct])).toEqual([])
  })

  // The Signals of the Project `glue-build` on 2026-10-06.
  it('puts only the survey answers with the same words into the groups of the live list', () => {
    const many = [1, 2, 3, 4].map((id) => answer(id, 2))
    const start = [5, 6, 7, 8].map((id) => answer(id, 1))

    expect(
      groupSignals([
        many[0],
        wrongStatus,
        pickOption,
        noProduct,
        start[0],
        ...many.slice(1),
        ...start.slice(1),
      ]),
    ).toEqual([
      {
        title: 'Too many options to pick from',
        signals: many.map(({ url }) => url),
        sources: ['analytics'],
      },
      {
        title: 'I could not find where to start',
        signals: start.map(({ url }) => url),
        sources: ['analytics'],
      },
    ])
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
      {
        title: slow.title,
        signals: [slow.url, slowAgain.url],
        sources: ['github'],
      },
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
      {
        title: 'Too hard',
        signals: [hard.url, hardAgain.url],
        sources: ['support', 'github'],
      },
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
      {
        title: 'Slow search results',
        signals: [search.url, both.url],
        sources: ['support'],
      },
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
