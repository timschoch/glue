import type { Meta, StoryObj } from '@storybook/react-vite'

import { Card } from './card.tsx'
import styles from './card.stories.module.scss'

const meta = {
  title: 'Card',
  component: Card,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className={styles.canvas}>
        <Story />
      </div>
    ),
  ],
  args: {
    trust: 'solid',
    workState: 'published',
    owner: 'Mara',
    href: '#',
  },
} satisfies Meta<typeof Card>

export default meta

type Story = StoryObj<typeof meta>

export const Insight: Story = {
  args: {
    type: 'insight',
    recordId: 'I7',
    evidenceLevel: 'pattern',
    title: 'Bakers want step videos',
    summary: 'Eight of ten novices stop at stretch and fold.',
  },
}

export const Goal: Story = {
  args: {
    type: 'goal',
    recordId: 'G2',
    title: 'First bake feels easy',
    summary: 'The ease of the first bake goes up by one point.',
  },
}

export const Decision: Story = {
  args: {
    type: 'decision',
    recordId: 'D12',
    title: 'Show the video of the creator',
    summary: 'Each technique of a recipe shows the video of its creator.',
  },
}

export const Guardrail: Story = {
  args: {
    type: 'guardrail',
    recordId: 'R4',
    trust: 'not-ready',
    workState: 'draft',
    title: 'Only the videos of the creator',
  },
}

export const Entity: Story = {
  args: {
    type: 'entity',
    recordId: 'E3',
    title: 'Technique',
    summary: 'A baking task that a novice cannot do from its name alone.',
  },
}

export const Flow: Story = {
  args: {
    type: 'flow',
    recordId: 'F5',
    trust: 'flagged',
    workState: 'to-check',
    title: 'Watch a technique while baking',
    emptySlots: ['guardrail', 'entity'],
  },
}

export const Metric: Story = {
  args: {
    type: 'metric',
    recordId: 'M1',
    trust: 'wrong',
    title: 'Ease of the first bake',
  },
}

export const WithAction: Story = {
  args: {
    ...Insight.args,
    trust: 'flagged',
    workState: 'to-check',
    owner: 'Fred',
    action: { label: 'Pick up', onClick: () => {} },
  },
}

export const Minimal: Story = {
  args: { ...Decision.args, minimal: true },
}

export const LongTitle: Story = {
  args: {
    ...Decision.args,
    title:
      'Show the video of the creator beside each step of the recipe, and keep it on the screen while the baker works with wet hands',
    summary:
      'Each technique of a recipe shows the video of its creator. The video stays beside the step, and the baker starts it with one touch or with a word.',
  },
}

export const MissingValue: Story = {
  args: {
    type: 'decision',
    recordId: 'D13',
    trust: 'not-ready',
    title: 'Loop the video without sound',
    workState: 'draft',
    owner: undefined,
    emptySlots: ['insight', 'metric'],
  },
}
