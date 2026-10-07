import type { Meta, StoryObj } from '@storybook/react-vite'

import { KindForm } from './kind-form.tsx'
import styles from './part-form.stories.module.scss'

const meta = {
  title: 'Kind form',
  component: KindForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    onSave: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof KindForm>

export default meta

type Story = StoryObj<typeof meta>

export const AddKind: Story = {}

// A PRD needs a Goal and two Flows. A Metric is optional.
export const ChangeKind: Story = {
  args: {
    kind: {
      name: 'PRD',
      slots: [
        { type: 'goal', required: true, minCount: 1 },
        { type: 'flow', required: true, minCount: 2 },
        { type: 'metric', required: false, minCount: 1 },
      ],
    },
  },
}

export const Saving: Story = {
  args: { ...ChangeKind.args, pending: true },
}

export const ServerFailure: Story = {
  args: { ...ChangeKind.args, serverError: 'kind "prd" exists already' },
}

export const NarrowWindow: Story = {
  args: ChangeKind.args,
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
}
