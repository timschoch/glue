import type { Meta, StoryObj } from '@storybook/react-vite'

import { PlainFrame } from './frame.tsx'
import { PartCards } from './part-cards.tsx'

const meta = {
  title: 'Part list',
  component: PartCards,
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
} satisfies Meta<typeof PartCards>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

// The section Use: a reading on target, one off target, one with no target
// yet and one empty slot.
export const Readings: Story = {
  args: {
    title: 'Use',
    parts: [
      {
        id: 'G2',
        type: 'goal',
        title: 'First bake feels easy',
        trust: 'solid',
        workState: 'published',
        reading: { value: '5.8', target: '5.5', onTarget: true },
        concept: 'First bake',
        href: '#',
      },
      {
        id: 'M1',
        type: 'metric',
        title: 'Signup to first bake',
        trust: 'solid',
        workState: 'published',
        reading: { value: '18.4%', target: '25%', onTarget: false },
        concept: 'First bake',
        href: '#',
      },
      {
        id: 'M2',
        type: 'metric',
        title: 'Videos watched to the end',
        trust: 'solid',
        workState: 'published',
        reading: { target: '40%' },
        concept: 'Technique videos',
        href: '#',
      },
      {
        id: 'M3',
        type: 'metric',
        title: 'Bakes shared',
        trust: 'not-ready',
        workState: 'draft',
        reading: {},
        concept: 'First bake',
        href: '#',
      },
    ],
  },
}

// The Parts that the person watches, one with a flag.
export const Watched: Story = {
  args: {
    watched: [
      {
        id: 'F5',
        type: 'flow',
        title: 'Watch a technique while baking',
        trust: 'flagged',
        workState: 'to-check',
        note: 'Changed I7 Bakers want step videos',
        concept: 'Technique videos',
        href: '#',
      },
      {
        id: 'M1',
        type: 'metric',
        title: 'Signup to first bake',
        trust: 'solid',
        workState: 'published',
        concept: 'First bake',
        href: '#',
      },
    ],
  },
}

// The Asks of the person: one to pick, one to hand back with an Insight of
// the own Project, and one that came back.
export const Asks: Story = {
  args: {
    asks: [
      {
        id: 1,
        part: {
          id: 'I4',
          type: 'insight',
          title: 'Bakers stop at the fold',
          trust: 'solid',
          concept: 'Flexibeck',
          href: '#',
        },
        action: { label: 'Pick', onClick: () => {} },
      },
      {
        id: 2,
        part: {
          id: 'I9',
          type: 'insight',
          title: 'Bakers skip long texts',
          trust: 'solid',
          concept: 'Flexibeck',
          href: '#',
        },
        action: {
          label: 'Hand back',
          pick: {
            label: 'Insight',
            parts: [
              {
                id: 'I7',
                type: 'insight',
                title: 'Bakers want step videos',
                trust: 'solid',
                href: '#',
              },
            ],
            onPick: () => {},
          },
        },
      },
      {
        id: 3,
        part: {
          id: 'I2',
          type: 'insight',
          title: 'Readers watch on the phone',
          trust: 'solid',
          note: 'I7 Bakers want step videos',
          concept: 'UX study',
          href: '#',
        },
        action: { label: 'Check and glue', onClick: () => {} },
      },
    ],
  },
}

export const Empty: Story = { args: { parts: [] } }

export const InNarrowWindow: Story = {
  globals: { viewport: { value: 'mobile1' } },
}
