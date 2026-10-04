import { describe, expect, it } from 'vitest'

import { findMentions } from './mention.ts'

describe('findMentions', () => {
  it('finds each record id with a # in a body', () => {
    expect(findMentions('It builds on #D12, and on #I7.')).toEqual([
      { recordId: 'D12' },
      { recordId: 'I7' },
    ])
  })

  it('finds a record of another Project', () => {
    expect(findMentions('The same as flexibeck#F2 and my-shop#G1.')).toEqual([
      { project: 'flexibeck', recordId: 'F2' },
      { project: 'my-shop', recordId: 'G1' },
    ])
  })

  it('reads a lower case id as the upper case id', () => {
    expect(findMentions('See #d12 and flexibeck#f2.')).toEqual([
      { recordId: 'D12' },
      { project: 'flexibeck', recordId: 'F2' },
    ])
  })

  it('finds a record id in a list, a heading and bold text', () => {
    expect(findMentions('## After #G1\n\n- **#I2** first\n- then #R3')).toEqual(
      [{ recordId: 'G1' }, { recordId: 'I2' }, { recordId: 'R3' }],
    )
  })

  it('gives a record that the body names twice one time', () => {
    expect(findMentions('#D12 and #d12 and glue#D12')).toEqual([
      { recordId: 'D12' },
      { project: 'glue', recordId: 'D12' },
    ])
  })

  it('finds no mention in inline code', () => {
    expect(findMentions('Type `#D12` or ``flexibeck#F2``.')).toEqual([])
  })

  it('finds no mention in a code block', () => {
    const body = [
      '```',
      '#D12',
      '```',
      '',
      '~~~text',
      '#I7',
      '~~~',
      '',
      '    #G1',
    ].join('\n')

    expect(findMentions(body)).toEqual([])
  })

  it('finds no mention in the text of a link', () => {
    expect(findMentions('[the issue #D12](https://example.com)')).toEqual([])
  })

  it('finds no mention in a bare id', () => {
    expect(findMentions('D12 and I7 stay plain text.')).toEqual([])
  })

  it('finds no mention in a # that is not before a record id', () => {
    expect(findMentions('# D12\n\n#12, #DD1, #D12a and #D.')).toEqual([])
  })
})
