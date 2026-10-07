import type { Meta, StoryObj } from '@storybook/react-vite'

import { NextBox } from './next-box.tsx'
import styles from './record.stories.module.scss'

const answers = [
  { label: 'Not ready', onClick: () => {} },
  { label: 'Sink it', onClick: () => {} },
]

const meta = {
  title: 'Next box',
  component: NextBox,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: { actions: [{ label: 'Add Decision', onClick: () => {} }, ...answers] },
} satisfies Meta<typeof NextBox>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const OneAction: Story = {
  args: { actions: [{ label: 'Sign off', onClick: () => {} }] },
}

// No step is left: the answers stay in the menu.
export const NoStep: Story = { args: { actions: answers, hasStep: false } }

export const Pending: Story = { args: { pending: 'Saving' } }

export const Failed: Story = {
  args: {
    actions: [{ label: 'Sign off', onClick: () => {} }],
    error: 'sign-off needs Trust solid: F5',
  },
}
