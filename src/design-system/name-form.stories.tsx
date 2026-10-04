import type { Meta, StoryObj } from '@storybook/react-vite'

import { NameForm } from './name-form.tsx'
import styles from './part-form.stories.module.scss'

const meta = {
  title: 'Name form',
  component: NameForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    heading: 'Concept',
    label: 'Title',
    onSave: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof NameForm>

export default meta

type Story = StoryObj<typeof meta>

export const AddConcept: Story = {}

export const AddProject: Story = {
  args: { heading: 'Project', label: 'Slug', placeholder: 'bakeday' },
}

export const Saving: Story = { args: { pending: true } }

export const WithErrors: Story = {
  args: {
    ...AddProject.args,
    error: 'The slug bakeday is taken',
    serverError: 'Not saved: no connection',
  },
}

export const NarrowWindow: Story = {
  args: WithErrors.args,
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
}
