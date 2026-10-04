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
        insight: null,
      },
      {
        url: 'https://github.com/timschoch/glue/issues/5',
        title: 'I lose my place in the list',
        date: '2026-10-01',
        insight: null,
      },
      {
        url: 'https://github.com/timschoch/glue/issues/3',
        title: 'The search finds nothing',
        date: '2026-09-30',
        insight: { id: 'I4', title: 'Search needs synonyms', href: '#' },
      },
    ],
    onMakeInsight: () => {},
  },
} satisfies Meta<typeof Signals>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoSignals: Story = { args: { signals: [] } }

export const NoRepository: Story = {
  args: { signals: [], reason: 'The Project has no repository' },
}
