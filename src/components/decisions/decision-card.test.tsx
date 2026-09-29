import { MantineProvider } from '@mantine/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DecisionCard } from './decision-card'
import type { Decision } from './decision-card'

const decision: Decision = {
  id: 'D42',
  title: 'Agents read the Concept through one export',
  href: '/decisions/D42',
  date: '2026-01-15',
  owner: 'Owner',
  status: 'proposed',
  goal: {
    id: 'G7',
    title: 'Agents build from the Concept',
    href: '/goals/G7',
  },
  evidence: [
    { id: 'I3', title: 'Agents skip long documents', href: '/insights/I3' },
    { id: 'F9', title: 'An export is one request', href: '/facts/F9' },
  ],
}

function renderCard(shown: Decision = decision): string {
  return renderToStaticMarkup(
    <MantineProvider>
      <DecisionCard decision={shown} />
    </MantineProvider>,
  )
}

// What a reader sees of the first match: the first group, without its tags.
function shownText(markup: string, pattern: RegExp): string {
  const [, content = ''] = pattern.exec(markup) ?? []
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function elementText(markup: string, tag: string): string {
  return shownText(markup, new RegExp(`<${tag}(?: [^>]*)?>(.*?)</${tag}>`, 's'))
}

function linkText(markup: string, href: string): string {
  return shownText(
    markup,
    new RegExp(`<a [^>]*href="${href}"[^>]*>(.*?)</a>`, 's'),
  )
}

describe('DecisionCard', () => {
  it('shows the id and the title as one link to the Decision, in a heading', () => {
    const markup = renderCard()

    expect(elementText(markup, 'h2')).toBe(
      'D42 Agents read the Concept through one export',
    )
    expect(linkText(markup, '/decisions/D42')).toBe(
      'D42 Agents read the Concept through one export',
    )
  })

  it('shows the status as a word, the date and the owner', () => {
    const markup = renderCard()

    expect(elementText(markup, 'p')).toBe('Proposed 2026-01-15 Owner')
    // HTML attribute names have no case, React writes `dateTime`.
    expect(markup).toMatch(/<time datetime="2026-01-15">/i)
  })

  it.each([
    ['accepted', 'Accepted'],
    ['superseded', 'Superseded'],
  ] as const)('shows the status %s as %s', (status, word) => {
    const markup = renderCard({ ...decision, status })

    expect(elementText(markup, 'p')).toContain(word)
  })

  it('links the Goal and each evidence record, with a label', () => {
    const markup = renderCard()

    expect(elementText(markup, 'dl')).toBe(
      'Goal G7 Agents build from the Concept Evidence I3 Agents skip long documents F9 An export is one request',
    )
    expect(linkText(markup, '/goals/G7')).toBe(
      'G7 Agents build from the Concept',
    )
    expect(linkText(markup, '/insights/I3')).toBe(
      'I3 Agents skip long documents',
    )
    expect(linkText(markup, '/facts/F9')).toBe('F9 An export is one request')
  })
})
