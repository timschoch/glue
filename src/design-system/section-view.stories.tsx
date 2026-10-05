import type { Meta, StoryObj } from '@storybook/react-vite'

import { PlainFrame } from './frame.tsx'
import { SectionView } from './section-view.tsx'

const firstBake = { concept: 'First bake', home: 'first-bake' }
const videos = { concept: 'Technique videos', home: 'technique-videos' }

const meta = {
  title: 'Section',
  component: SectionView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: {
    title: 'Decide',
    types: ['goal', 'decision'],
    parts: [
      {
        id: 'G2',
        type: 'goal',
        title: 'First bake feels easy',
        trust: 'solid',
        workState: 'published',
        flightLevel: 'operational',
        href: '#',
        ...firstBake,
      },
      {
        id: 'D12',
        type: 'decision',
        title: 'Show the video of the creator',
        trust: 'not-ready',
        workState: 'review',
        flightLevel: 'strategic',
        href: '#',
        ...videos,
      },
      {
        id: 'D13',
        type: 'decision',
        title: 'Cut each video into steps',
        trust: 'solid',
        workState: 'published',
        flightLevel: 'strategic',
        href: '#',
        ...videos,
      },
      {
        id: 'D14',
        type: 'decision',
        title: 'Start with one recipe',
        trust: 'flagged',
        workState: 'to-check',
        flightLevel: 'strategic',
        href: '#',
        ...firstBake,
      },
    ],
    onDetailChange: () => {},
    onAddPart: () => {},
  },
} satisfies Meta<typeof SectionView>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Detail: Story = { args: { detail: true } }

export const Empty: Story = { args: { parts: [] } }

export const InNarrowWindow: Story = {
  globals: { viewport: { value: 'mobile1' } },
}
