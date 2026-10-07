import type { Meta, StoryObj } from '@storybook/react-vite'

import { Assignees } from './assignees.tsx'
import styles from './part-form.stories.module.scss'

const meta = {
  title: 'Assignees',
  component: Assignees,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    members: [
      { id: 1, name: 'Ada Lovelace' },
      { id: 2, name: 'Bo Chen' },
      { id: 3, name: 'Cy Park' },
    ],
    responsible: 1,
    coAuthors: [2],
    onChange: () => {},
  },
} satisfies Meta<typeof Assignees>

export default meta

type Story = StoryObj<typeof meta>

export const Member: Story = {}

export const Nobody: Story = { args: { responsible: null, coAuthors: [] } }

export const ReadOnly: Story = { args: { onChange: undefined } }

// A change that is not saved yet.
export const Saving: Story = { args: { pending: 'Saving' } }

export const WithError: Story = {
  args: { error: 'Only a member of the Project can change it.' },
}
