import type { Meta, StoryObj } from '@storybook/react-vite'

import { PlainFrame } from './frame.tsx'
import { PartList } from './part-list.tsx'

const meta = {
  title: 'Part list',
  component: PartList,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: {
    title: 'Mine',
    parts: [
      {
        id: 'G2',
        type: 'goal',
        title: 'First bake feels easy',
        trust: 'flagged',
        workState: 'to-check',
        concept: 'First bake',
        href: '#',
      },
      {
        id: 'D12',
        type: 'decision',
        title: 'Show the video of the creator',
        trust: 'not-ready',
        workState: 'review',
        concept: 'Technique videos',
        href: '#',
      },
      {
        id: 'I7',
        type: 'insight',
        title: 'Bakers want step videos',
        trust: 'not-ready',
        workState: 'draft',
        concept: 'Technique videos',
        href: '#',
      },
    ],
  },
} satisfies Meta<typeof PartList>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = { args: { parts: [] } }

export const InNarrowWindow: Story = {
  globals: { viewport: { value: 'mobile1' } },
}
