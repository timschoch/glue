import type { Meta, StoryObj } from '@storybook/react-vite'

import { IntegrationForm, Integrations } from './integrations.tsx'
import styles from './part-form.stories.module.scss'

const form = <IntegrationForm tools={['github']} onAdd={() => {}} />

const meta = {
  title: 'Integrations',
  component: Integrations,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    integrations: [
      {
        id: 1,
        tool: 'github',
        address: 'acme/shop',
        keyLastFour: '1234',
        state: 'active',
      },
      {
        id: 2,
        tool: 'github',
        address: 'acme/web',
        keyLastFour: 'wxyz',
        state: 'paused',
      },
      {
        id: 3,
        tool: 'github',
        address: 'acme/app',
        keyLastFour: '9876',
        state: 'failed',
        error: 'GitHub refused the key',
      },
    ],
    onPause: () => {},
    onStart: () => {},
    onRemove: () => {},
    onClose: () => {},
    children: form,
  },
} satisfies Meta<typeof Integrations>

export default meta

type Story = StoryObj<typeof meta>

export const Member: Story = {}

export const Empty: Story = { args: { integrations: [] } }

export const ReadOnly: Story = {
  args: {
    onPause: undefined,
    onStart: undefined,
    onRemove: undefined,
    children: undefined,
  },
}

export const Pending: Story = {
  args: { change: { id: 2, pending: 'Starting' } },
}

export const RefusedKey: Story = {
  args: {
    integrations: [],
    children: (
      <IntegrationForm
        tools={['github']}
        errors={{ key: 'GitHub refused the key' }}
        onAdd={() => {}}
      />
    ),
  },
}
