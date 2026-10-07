import { describe, expect, it } from 'vitest'

import { applySignalFilters } from './signal-filter-rule.ts'
import type { Signal } from './signals.ts'

const slowIssue: Signal = {
  url: 'https://github.com/timschoch/glue/issues/7',
  title: 'The list is slow',
  text: 'It takes five seconds to open.',
  date: '2026-10-02',
  source: 'github',
  insight: null,
}
const slowTicket: Signal = {
  url: 'https://support.test/agent/tickets/4',
  title: 'The list is slow to open',
  text: '',
  date: '2026-09-29',
  source: 'support',
  insight: null,
}
const slowComment: Signal = {
  url: 'https://social.test/comments/1',
  title: 'Comment of ada',
  titleBy: 'glue',
  text: 'The list is SLOW on my phone',
  date: '2026-10-03',
  source: 'social',
  insight: null,
}
const refund: Signal = {
  url: 'https://support.test/agent/tickets/3',
  title: 'Where is my refund?',
  text: 'I asked two weeks ago.',
  date: '2026-10-01',
  source: 'support',
  insight: null,
}
const all = [slowComment, slowIssue, refund, slowTicket]

const none = { mustHold: [], mustNotHold: [], sources: [] }

describe('applySignalFilters', () => {
  it('keeps each Signal with no filter', () => {
    expect(applySignalFilters(all, []).signals).toEqual(all)
  })

  it('keeps the Signals that hold each word in the title or the text, in any case', () => {
    const { signals } = applySignalFilters(all, [
      { ...none, mustHold: ['slow', 'Open'] },
    ])

    expect(signals).toEqual([slowIssue, slowTicket])
  })

  it('drops the Signals that hold one of the words that they must not hold', () => {
    const { signals } = applySignalFilters(all, [
      { ...none, mustHold: ['slow'], mustNotHold: ['phone', 'seconds'] },
    ])

    expect(signals).toEqual([slowTicket])
  })

  it('keeps the Signals of the sources of the filter', () => {
    const { signals } = applySignalFilters(all, [
      { ...none, sources: ['support', 'social'] },
    ])

    expect(signals).toEqual([slowComment, refund, slowTicket])
  })

  it('keeps the Signals that pass each filter', () => {
    const { signals } = applySignalFilters(all, [
      { ...none, mustHold: ['slow'] },
      { ...none, sources: ['support'] },
    ])

    expect(signals).toEqual([slowTicket])
  })

  it('makes the groups from the Signals that pass, so a title follows the filter', () => {
    expect(applySignalFilters(all, []).groups).toEqual([
      {
        title: 'The list is SLOW on my phone',
        signals: [slowComment.url, slowIssue.url, slowTicket.url],
        sources: ['social', 'github', 'support'],
      },
    ])

    expect(
      applySignalFilters(all, [{ ...none, mustNotHold: ['phone'] }]).groups,
    ).toEqual([
      {
        title: 'The list is slow',
        signals: [slowIssue.url, slowTicket.url],
        sources: ['github', 'support'],
      },
    ])
  })
})
