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
        signals: [
          'https://github.com/timschoch/glue/issues/7',
          'https://support.example.com/agent/tickets/4',
        ],
      },
    ],
  },
}

export const NoSignals: Story = { args: { signals: [] } }

export const FailedSource: Story = {
  args: { failures: [{ source: 'github', reason: 'GitHub answered 503' }] },
}
