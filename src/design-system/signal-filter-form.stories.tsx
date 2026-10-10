import type { Meta, StoryObj } from '@storybook/react-vite'

import { shownSources } from '../test/signal-sources.ts'
import styles from './part-form.stories.module.scss'
import { SignalFilterForm } from './signal-filter-form.tsx'

const meta = {
  title: 'Signal filter form',
  component: SignalFilterForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    sources: shownSources,
    onSave: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof SignalFilterForm>

export default meta

type Story = StoryObj<typeof meta>

export const AddFilter: Story = {}

// The slow list, as the customers say it in public, without the bots.
export const ChangeFilter: Story = {
  args: {
    filter: {
      name: 'Slow list',
      mustHold: ['slow', 'list'],
      mustNotHold: ['bot'],
      sources: ['social', 'market'],
    },
    onDelete: () => {},
  },
}

export const Saving: Story = {
  args: { ...ChangeFilter.args, pending: 'Saving' },
}

export const Deleting: Story = {
  args: { ...ChangeFilter.args, pending: 'Deleting' },
}

export const TakenName: Story = {
  args: {
    ...ChangeFilter.args,
    errors: { name: 'A filter has this name already.' },
  },
}

export const ServerFailure: Story = {
  args: { ...ChangeFilter.args, serverError: 'Glue is not available' },
}

export const NarrowWindow: Story = {
  args: ChangeFilter.args,
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
}
