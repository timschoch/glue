// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  Decision,
  Fact,
  Goal,
  Guardrail,
  Insight,
} from '../../db/concept.ts'
import type { MeanMeasure } from '../../db/goal-measure.ts'
import { renderInRouter, shownValue } from '../../test/render.tsx'
import { Announcer } from '../page/announcer.tsx'
import { RecordView } from './record-view.tsx'

const decision: Decision = {
  kind: 'decision',
  id: 'D5',
  title: 'The Concept lives in the database',
  date: '2026-01-15',
  owner: 'Owner',
  status: 'accepted',
  body: 'Files do not scale to many Products.',
  goal: { id: 'G1', title: 'Agents build from the Concept' },
  evidence: [
    { id: 'I1', title: 'Agents skip long documents' },
    { id: 'F2', title: 'An export is one request' },
  ],
  supersededBy: null,
  supersedes: [],
  issueUrl: null,
}

const goal: Goal = {
  kind: 'goal',
  id: 'G1',
  title: 'Agents build from the Concept',
  metric: 'Share of tickets with a Decision',
  source: 'GitHub issues',
  measure: null,
  status: 'open',
  baseline: null,
  latestValue: null,
  latestBreakdownValue: null,
  measuredAt: null,
  body: 'Each ticket names its Decision.',
  decisions: [{ id: 'D5', title: 'The Concept lives in the database' }],
}

const insight: Insight = {
  kind: 'insight',
  id: 'I1',
  title: 'Agents skip long documents',
  date: '2026-01-10',
  source: 'https://example.com/research?round=2',
  status: 'draft',
  evidenceLevel: null,
  body: 'Three of four agents read only the first screen.',
  decisions: [{ id: 'D5', title: 'The Concept lives in the database' }],
}

const uncited: Insight = { ...insight, decisions: [] }

const fact: Fact = {
  kind: 'fact',
  id: 'F2',
  title: 'An export is one request',
  source: 'API contract',
  body: 'The export has one endpoint.',
  decisions: [],
}

const guardrail: Guardrail = {
  kind: 'guardrail',
  id: 'R1',
  title: 'No query over 200 ms',
  enforcedBy: 'verify ci',
  source: null,
  body: 'A slow query stops the build.',
}

const handlers = {
  onKeep: () => Promise.resolve(undefined),
  onDiscard: () => Promise.resolve(undefined),
  onAccept: () => Promise.resolve(undefined),
  onClose: () => Promise.resolve(undefined),
  onReopen: () => Promise.resolve(undefined),
}

const mean: MeanMeasure = {
  kind: 'mean',
  source: 'mock-analytics',
  event: 'survey sent',
  property: 'answer',
  target_change: 1,
  window_days: 14,
}

const meanGoal: Goal = {
  ...goal,
  measure: mean,
  baseline: 3.5,
  latestValue: 4.256,
  latestBreakdownValue: null,
  measuredAt: '2026-09-30T14:05:12.000Z',
}

const unmeasured = {
  baseline: null,
  latestValue: null,
  latestBreakdownValue: null,
  measuredAt: null,
}

function path(name: string) {
  return screen.getByRole('link', { name }).getAttribute('href')
}

function shownLinks(label: string) {
  const value = screen.getByText(label, { selector: 'dt' }).nextElementSibling
  if (!(value instanceof HTMLElement)) throw new Error(`${label} has no value`)
  return within(value)
    .queryAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')])
}

describe('RecordView', () => {
  it('shows the id and the title as the heading of the page', async () => {
    await renderInRouter(<RecordView {...handlers} record={decision} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'D5 The Concept lives in the database',
    )
  })

  it.each([
    [decision, 'Decisions', '/glue#decisions'],
    [goal, 'Goals', '/glue#goals'],
    [insight, 'Insights', '/glue#insights'],
    [fact, 'Facts', '/glue#facts'],
    [guardrail, 'Guardrails', '/glue#guardrails'],
  ])(
    'shows the way back to the overview and to its section',
    async (record, section, target) => {
      await renderInRouter(<RecordView {...handlers} record={record} />)

      const breadcrumb = within(
        screen.getByRole('navigation', { name: 'Breadcrumb' }),
      )

      expect(
        breadcrumb
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual([
        ['Concept', '/glue'],
        [section, target],
      ])
    },
  )

  it('shows all fields of a Decision, with its Goal and its evidence', async () => {
    await renderInRouter(<RecordView {...handlers} record={decision} />)

    expect(shownValue('Status')).toBe('Accepted')
    expect(shownValue('Date')).toBe('2026-01-15')
    expect(shownValue('Owner')).toBe('Owner')
    expect(shownLinks('Goal')).toEqual([
      ['G1 Agents build from the Concept', '/glue/concept/G1'],
    ])
    expect(shownLinks('Evidence')).toEqual([
      ['I1 Agents skip long documents', '/glue/concept/I1'],
      ['F2 An export is one request', '/glue/concept/F2'],
    ])
    expect(screen.queryByText('Superseded by')).toBeNull()
    expect(screen.queryByText('Supersedes')).toBeNull()
    expect(screen.queryByText('Issue')).toBeNull()
  })

  it('links a Decision to the issue that builds it', async () => {
    await renderInRouter(
      <RecordView
        {...handlers}
        record={{
          ...decision,
          issueUrl: 'https://github.com/timschoch/flexibeck-next/issues/4',
        }}
      />,
    )

    expect(shownLinks('Issue')).toEqual([
      [
        'timschoch/flexibeck-next#4',
        'https://github.com/timschoch/flexibeck-next/issues/4',
      ],
    ])
  })

  it('says how to open the issue that GitHub did not open', async () => {
    await renderInRouter(
      <RecordView {...handlers} issueMissing record={decision} />,
    )

    expect(shownValue('Issue')).toBe(
      'Not opened: GitHub did not answer. To open it, run pnpm concept downstream D5 --project glue',
    )
  })

  it('shows the issue, not the command, when the Decision has one', async () => {
    const issueUrl = 'https://github.com/timschoch/flexibeck-next/issues/4'
    await renderInRouter(
      <RecordView
        {...handlers}
        issueMissing
        record={{ ...decision, issueUrl }}
      />,
    )

    expect(shownValue('Issue')).toBe('timschoch/flexibeck-next#4')
  })

  it.each([
    'https://github.com/timschoch',
    'https://gitlab.com/timschoch/glue/-/issues/4',
  ])(
    'shows the issue %s that is not a GitHub issue as it is',
    async (issueUrl) => {
      await renderInRouter(
        <RecordView {...handlers} record={{ ...decision, issueUrl }} />,
      )

      expect(shownLinks('Issue')).toEqual([[issueUrl, issueUrl]])
    },
  )

  it('says that a Decision has no evidence', async () => {
    await renderInRouter(
      <RecordView {...handlers} record={{ ...decision, evidence: [] }} />,
    )

    expect(shownValue('Evidence')).toBe('No evidence yet')
  })

  it('links a Decision to the Decisions before and after it', async () => {
    await renderInRouter(
      <RecordView
        {...handlers}
        record={{
          ...decision,
          status: 'superseded',
          supersededBy: { id: 'D9', title: 'The Concept has versions' },
          supersedes: [{ id: 'D2', title: 'The Concept lives in files' }],
        }}
      />,
    )

    expect(shownLinks('Superseded by')).toEqual([
      ['D9 The Concept has versions', '/glue/concept/D9'],
    ])
    expect(shownLinks('Supersedes')).toEqual([
      ['D2 The Concept lives in files', '/glue/concept/D2'],
    ])
  })

  it('shows all fields of a Goal, with the Decisions that serve it', async () => {
    await renderInRouter(<RecordView {...handlers} record={goal} />)

    expect(shownValue('Status')).toBe('Open')
    expect(shownValue('Metric')).toBe('Share of tickets with a Decision')
    expect(shownValue('Source')).toBe('GitHub issues')
    expect(shownLinks('Decisions')).toEqual([
      ['D5 The Concept lives in the database', '/glue/concept/D5'],
    ])
  })

  it('shows all fields of an Insight, with the Decisions that cite it', async () => {
    await renderInRouter(<RecordView {...handlers} record={insight} />)

    expect(shownValue('Status')).toBe('Draft')
    expect(shownValue('Date')).toBe('2026-01-10')
    expect(shownLinks('Cited by')).toEqual([
      ['D5 The Concept lives in the database', '/glue/concept/D5'],
    ])
  })

  it('shows no status for an Insight without one', async () => {
    await renderInRouter(
      <RecordView {...handlers} record={{ ...insight, status: null }} />,
    )

    expect(screen.queryByText('Status')).toBeNull()
  })

  it('shows a source that is a web address as a link', async () => {
    await renderInRouter(<RecordView {...handlers} record={insight} />)

    expect(path('https://example.com/research?round=2')).toBe(
      'https://example.com/research?round=2',
    )
  })

  it.each(['javascript:alert(1)', 'API contract', 'ftp://example.com/file'])(
    'shows the source %s as text',
    async (source) => {
      await renderInRouter(
        <RecordView {...handlers} record={{ ...fact, source }} />,
      )

      expect(shownValue('Source')).toBe(source)
      expect(shownLinks('Source')).toEqual([])
    },
  )

  it('shows all fields of a Fact, and says that no Decision cites it', async () => {
    await renderInRouter(<RecordView {...handlers} record={fact} />)

    expect(shownValue('Source')).toBe('API contract')
    expect(shownValue('Cited by')).toBe('No Decision cites this Fact yet')
  })

  it('says that no Decision serves a Goal', async () => {
    await renderInRouter(
      <RecordView {...handlers} record={{ ...goal, decisions: [] }} />,
    )

    expect(shownValue('Decisions')).toBe('No Decision serves this Goal yet')
  })

  describe('the progress of a Goal', () => {
    const progress = () =>
      within(screen.getByRole('region', { name: 'Progress' }))

    it('shows the baseline, the latest value with its time, and the target of a mean', async () => {
      await renderInRouter(<RecordView {...handlers} record={meanGoal} />)

      expect(shownValue('Baseline')).toBe('3.5')
      expect(shownValue('Latest value')).toBe(
        '4.26, measured 2026-09-30 14:05 UTC',
      )
      expect(
        progress().getByText('2026-09-30 14:05 UTC').getAttribute('datetime'),
      ).toBe('2026-09-30T14:05:12.000Z')
      expect(shownValue('Target')).toBe('4.5, the baseline +1')
    })

    describe('with a baseline value', () => {
      const versionGoal: Goal = {
        ...meanGoal,
        measure: {
          ...mean,
          breakdown: 'app_version',
          baseline_value: 'eadfd12',
        },
        latestBreakdownValue: '184c42a',
      }

      it('names the breakdown values it compares', async () => {
        await renderInRouter(<RecordView {...handlers} record={versionGoal} />)

        expect(shownValue('Baseline')).toBe('3.5 for app_version eadfd12')
        expect(progress().getByText('app_version eadfd12').tagName).toBe('CODE')
        expect(progress().getByText('app_version 184c42a').tagName).toBe('CODE')
        expect(shownValue('Latest value')).toBe(
          '4.26 for app_version 184c42a, measured 2026-09-30 14:05 UTC',
        )
      })

      it('names the baseline value before the first measure run', async () => {
        await renderInRouter(
          <RecordView
            {...handlers}
            record={{ ...versionGoal, ...unmeasured }}
          />,
        )

        expect(shownValue('Baseline')).toBe(
          'Not measured yet (app_version eadfd12)',
        )
        expect(progress().getByText('app_version eadfd12').tagName).toBe('CODE')
        expect(shownValue('Latest value')).toBe('Not measured yet')
      })
    })

    it('shows a target below the baseline', async () => {
      await renderInRouter(
        <RecordView
          {...handlers}
          record={{
            ...meanGoal,
            measure: { ...mean, target_change: -0.5 },
          }}
        />,
      )

      expect(shownValue('Target')).toBe('3, the baseline -0.5')
    })

    it('says that a mean is not measured yet, and shows the target as a change', async () => {
      await renderInRouter(
        <RecordView {...handlers} record={{ ...meanGoal, ...unmeasured }} />,
      )

      expect(shownValue('Baseline')).toBe('Not measured yet')
      expect(shownValue('Latest value')).toBe('Not measured yet')
      expect(shownValue('Target')).toBe('The baseline +1')
    })

    it('shows the target of a funnel, which has no baseline', async () => {
      await renderInRouter(
        <RecordView
          {...handlers}
          record={{
            ...goal,
            measure: {
              kind: 'funnel',
              source: 'mock-analytics',
              steps: ['signed up', 'paid'],
              target: 0.125,
              window_days: 30,
            },
          }}
        />,
      )

      expect(shownValue('Target')).toBe('12.5% from the first step to the last')
      expect(progress().queryByText('Baseline')).toBeNull()
      expect(progress().queryByText('Latest value')).toBeNull()
    })

    it('says that Glue does not measure a Goal without a measure', async () => {
      await renderInRouter(<RecordView {...handlers} record={goal} />)

      expect(shownValue('Measure')).toBe(
        'None, so Glue does not measure this Goal',
      )
      expect(progress().queryByText('Target')).toBeNull()
    })

    it.each([decision, insight, fact, guardrail])(
      'is not there for $kind $id',
      async (record) => {
        await renderInRouter(<RecordView {...handlers} record={record} />)

        expect(screen.queryByRole('region', { name: 'Progress' })).toBeNull()
      },
    )
  })

  it('shows what enforces a Guardrail', async () => {
    await renderInRouter(<RecordView {...handlers} record={guardrail} />)

    expect(shownValue('Enforced by')).toBe('verify ci')
  })

  describe('the actions', () => {
    const actions = () => within(screen.getByRole('group', { name: 'Actions' }))

    it.each([fact, guardrail, { ...insight, status: null }])(
      'has none for $kind $id',
      async (record) => {
        await renderInRouter(<RecordView {...handlers} record={record} />)

        expect(screen.queryByRole('group', { name: 'Actions' })).toBeNull()
      },
    )

    it('closes an open Goal as achieved, says so, and moves the focus to the heading', async () => {
      const onClose = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <Announcer>
          <RecordView {...handlers} onClose={onClose} record={goal} />
        </Announcer>,
      )

      expect(actions().queryByRole('button', { name: 'Open again' })).toBeNull()
      await userEvent.click(
        actions().getByRole('button', { name: 'Close as achieved' }),
      )

      expect(onClose).toHaveBeenCalledOnce()
      expect(screen.getByRole('status').textContent).toBe('Closed G1.')
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1 }),
      )
    })

    it('opens an achieved Goal again, and says so', async () => {
      const onReopen = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <Announcer>
          <RecordView
            {...handlers}
            onReopen={onReopen}
            record={{ ...goal, status: 'achieved' }}
          />
        </Announcer>,
      )

      expect(shownValue('Status')).toBe('Achieved')
      expect(
        actions().queryByRole('button', { name: 'Close as achieved' }),
      ).toBeNull()
      await userEvent.click(
        actions().getByRole('button', { name: 'Open again' }),
      )

      expect(onReopen).toHaveBeenCalledOnce()
      expect(screen.getByRole('status').textContent).toBe('Opened G1.')
    })

    it('says why a Goal was not closed', async () => {
      await renderInRouter(
        <RecordView
          {...handlers}
          onClose={() => Promise.resolve({ message: 'goal "G1" not found' })}
          record={goal}
        />,
      )

      await userEvent.click(
        actions().getByRole('button', { name: 'Close as achieved' }),
      )

      expect((await screen.findByRole('alert')).textContent).toBe(
        'goal "G1" not found',
      )
    })

    it('keeps a draft Insight on request', async () => {
      const onKeep = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <RecordView {...handlers} onKeep={onKeep} record={insight} />,
      )

      await userEvent.click(actions().getByRole('button', { name: 'Keep I1' }))

      expect(onKeep).toHaveBeenCalledOnce()
    })

    it('discards a draft Insight after a second request', async () => {
      const onDiscard = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <Announcer>
          <RecordView {...handlers} onDiscard={onDiscard} record={uncited} />
        </Announcer>,
      )

      await userEvent.click(
        actions().getByRole('button', { name: 'Discard I1' }),
      )
      expect(onDiscard).not.toHaveBeenCalled()
      await userEvent.click(
        actions().getByRole('button', { name: 'Discard I1 for good' }),
      )

      expect(onDiscard).toHaveBeenCalledOnce()
      expect(screen.getByRole('status').textContent).toBe('Discarded I1.')
    })

    it('has no Discard for a draft Insight that a Decision cites', async () => {
      await renderInRouter(<RecordView {...handlers} record={insight} />)

      expect(actions().queryByRole('button', { name: 'Discard I1' })).toBeNull()
      expect(
        actions().getByText('I1 is evidence of D5, so you cannot discard it.'),
      ).toBeDefined()
    })

    it('says that the draft was kept, and moves the focus to the heading', async () => {
      await renderInRouter(
        <Announcer>
          <RecordView {...handlers} record={insight} />
        </Announcer>,
      )

      await userEvent.click(actions().getByRole('button', { name: 'Keep I1' }))

      expect(screen.getByRole('status').textContent).toBe('Kept I1.')
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1 }),
      )
    })

    it('says that the Decision was accepted, and moves the focus to the heading', async () => {
      await renderInRouter(
        <Announcer>
          <RecordView
            {...handlers}
            record={{ ...decision, status: 'proposed' }}
          />
        </Announcer>,
      )

      await userEvent.click(
        actions().getByRole('button', { name: 'Accept D5' }),
      )

      expect(screen.getByRole('status').textContent).toBe('Accepted D5.')
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1 }),
      )
    })

    it('links a draft Insight to the Decision form, as its evidence', async () => {
      await renderInRouter(<RecordView {...handlers} record={insight} />)

      expect(
        actions()
          .getByRole('link', { name: 'Propose a Decision from I1' })
          .getAttribute('href'),
      ).toBe('/glue/decisions/new?evidence=I1')
    })

    it('accepts a proposed Decision on request', async () => {
      const onAccept = vi.fn(() => Promise.resolve(undefined))
      await renderInRouter(
        <RecordView
          {...handlers}
          onAccept={onAccept}
          record={{ ...decision, status: 'proposed' }}
        />,
      )

      await userEvent.click(
        actions().getByRole('button', { name: 'Accept D5' }),
      )

      expect(onAccept).toHaveBeenCalledOnce()
    })

    it('says why a Decision was not accepted', async () => {
      await renderInRouter(
        <RecordView
          {...handlers}
          onAccept={() => Promise.resolve({ message: '"D5" is not proposed' })}
          record={{ ...decision, status: 'proposed' }}
        />,
      )

      await userEvent.click(
        actions().getByRole('button', { name: 'Accept D5' }),
      )

      expect((await screen.findByRole('alert')).textContent).toBe(
        '"D5" is not proposed',
      )
      expect(document.activeElement).not.toBe(
        screen.getByRole('heading', { level: 1 }),
      )
    })

    it.each(['proposed', 'accepted'] as const)(
      'links a Decision that is %s to the form that supersedes it',
      async (status) => {
        await renderInRouter(
          <RecordView {...handlers} record={{ ...decision, status }} />,
        )

        expect(
          actions()
            .getByRole('link', { name: 'Supersede D5' })
            .getAttribute('href'),
        ).toBe('/glue/decisions/new?supersedes=D5')
      },
    )

    it('does not accept a Decision that is accepted', async () => {
      await renderInRouter(<RecordView {...handlers} record={decision} />)

      expect(actions().queryByRole('button', { name: 'Accept D5' })).toBeNull()
    })

    it('has none for a Decision that is superseded', async () => {
      await renderInRouter(
        <RecordView
          {...handlers}
          record={{ ...decision, status: 'superseded' }}
        />,
      )

      expect(screen.queryByRole('group', { name: 'Actions' })).toBeNull()
    })
  })

  describe('the body', () => {
    const body = [
      'The **first** paragraph.',
      'See https://example.com/page for the source.',
      '# A heading in the text',
      '- one\n- two',
      '<script>alert(1)</script>',
      '[a bad link](javascript:alert(1))',
    ].join('\n\n')

    it('shows Markdown as text with structure', async () => {
      await renderInRouter(
        <RecordView {...handlers} record={{ ...decision, body }} />,
      )

      expect(screen.getByText('first').tagName).toBe('STRONG')
      expect(path('https://example.com/page')).toBe('https://example.com/page')
      expect(
        screen.getAllByRole('listitem').map((item) => item.textContent),
      ).toEqual(expect.arrayContaining(['one', 'two']))
    })

    it('keeps the record title the only heading of level 1', async () => {
      await renderInRouter(
        <RecordView {...handlers} record={{ ...decision, body }} />,
      )

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      expect(
        screen.getByRole('heading', { name: 'A heading in the text' }).tagName,
      ).toBe('H2')
    })

    it('does not run code from the text', async () => {
      const { container } = await renderInRouter(
        <RecordView {...handlers} record={{ ...decision, body }} />,
      )

      expect(container.querySelector('script')).toBeNull()
      expect(container.innerHTML).not.toContain('javascript:')
    })

    it('does not load an image from another site', async () => {
      const { container } = await renderInRouter(
        <RecordView
          {...handlers}
          record={{
            ...insight,
            body: 'Before ![a pixel](https://evil.example/pixel.png) after.',
          }}
        />,
      )

      expect(container.querySelector('img')).toBeNull()
      expect(screen.getByText(/Before/).textContent).toBe('Before  after.')
    })

    it('says that a record has no text', async () => {
      await renderInRouter(
        <RecordView {...handlers} record={{ ...decision, body: '  ' }} />,
      )

      expect(screen.getByText('This record has no text yet.')).toBeDefined()
    })
  })
})
