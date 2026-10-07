import type { Meta, StoryObj } from '@storybook/react-vite'

import { PlainFrame } from './frame.tsx'
import { Signals } from './signals.tsx'

const meta = {
  title: 'Signal list',
  component: Signals,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: {
    signals: [
      {
        url: 'https://github.com/timschoch/glue/issues/7',
        title: 'The list is slow',
        date: '2026-10-02',
        source: 'github',
        insight: null,
      },
      {
        url: 'https://support.example.com/agent/tickets/4',
        title: 'I lose my place in the list',
        date: '2026-10-01',
        source: 'support',
        insight: null,
      },
      {
        url: 'https://analytics.example.com/events/1',
        title: 'Survey answer 2 of 7',
        date: '2026-10-01',
        source: 'analytics',
        insight: null,
      },
      {
        url: 'https://github.com/timschoch/glue/issues/3',
        title: 'The search finds nothing',
        date: '2026-09-30',
        source: 'github',
        insight: { id: 'I4', title: 'Search needs synonyms', href: '#' },
      },
    ],
    onMakeInsight: () => {},
    onMakeHunch: () => {},
  },
} satisfies Meta<typeof Signals>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Groups: Story = {
  args: {
    groups: [
      {
        title: 'The list is slow',
        signals: [
          'https://github.com/timschoch/glue/issues/7',
          'https://support.example.com/agent/tickets/4',
        ],
      },
    ],
  },
}

// The list is in the flow from evidence to an Insight: the next step makes
// the Hunch of the largest group.
export const Flow: Story = {
  args: {
    ...Groups.args,
    findFlow: ([largest]) => ({
      bar: {
        name: 'Evidence to Insight',
        steps: ['Group', 'Check', 'Verify'],
        current: 0,
      },
      next: {
        actions: [{ label: `Make Hunch, ${largest.title}`, onClick: () => {} }],
      },
    }),
  },
}

export const HunchSaves: Story = {
  args: {
    ...Groups.args,
    hunch: {
      group: 'https://github.com/timschoch/glue/issues/7',
      pending: 'Saving',
    },
  },
}

export const HunchFailed: Story = {
  args: {
    ...Groups.args,
    hunch: {
      group: 'https://github.com/timschoch/glue/issues/7',
      failure: 'Glue is not available',
    },
  },
}

const fiveSources: Story['args'] = {
  signals: [
    ...meta.args.signals,
    {
      url: 'https://social.example.com/comments/12',
      title: 'The list is slow on my phone',
      date: '2026-09-29',
      source: 'social',
      insight: null,
    },
    {
      url: 'https://market.example.com/findings/2',
      title: 'Teams leave tools with a slow list',
      date: '2026-09-28',
      source: 'market',
      insight: null,
    },
  ],
  onAddFilter: () => {},
  onEditFilter: () => {},
  onSavedFilterChange: () => {},
}

export const FiveSources: Story = { args: fiveSources }

export const SavedFilters: Story = {
  args: {
    ...fiveSources,
    savedFilters: [
      { id: 1, name: 'Slow list', selected: false },
      { id: 2, name: 'Search', selected: false },
    ],
  },
}

// The filter "Slow list" is on: the list holds the Signals that pass it.
export const SavedFilterOn: Story = {
  args: {
    ...fiveSources,
    signals: fiveSources.signals?.filter(({ title }) => /slow/.test(title)),
    groups: [
      {
        title: 'The list is slow',
        signals: [
          'https://github.com/timschoch/glue/issues/7',
          'https://social.example.com/comments/12',
        ],
      },
    ],
    savedFilters: [
      { id: 1, name: 'Slow list', selected: true },
      { id: 2, name: 'Search', selected: false },
    ],
  },
}

export const NoSignals: Story = { args: { signals: [] } }

export const FailedSource: Story = {
  args: { failures: [{ source: 'github', reason: 'GitHub answered 503' }] },
}
