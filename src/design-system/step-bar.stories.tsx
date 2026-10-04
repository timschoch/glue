import type { Meta, StoryObj } from '@storybook/react-vite'

import { StepBar } from './step-bar.tsx'
import styles from './record.stories.module.scss'

const meta = {
  title: 'Step bar',
  component: StepBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    name: 'Insight to Decision',
    steps: ['Set Goal', 'Choose', 'Sign'],
    current: 1,
  },
} satisfies Meta<typeof StepBar>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FirstStep: Story = { args: { current: 0 } }

// A flow at its end: each step is done.
export const Done: Story = { args: { current: 3 } }

export const TwoSteps: Story = {
  args: { name: 'React to a change', steps: ['Check', 'Answer'], current: 0 },
}
