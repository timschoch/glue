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
        lastRead: {
          at: '2026-10-09T08:30:00.000Z',
          signalCount: 12,
          error: null,
        },
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
        lastRead: {
          at: '2026-10-10T07:05:00.000Z',
          signalCount: null,
          error: 'GitHub refused the key',
        },
      },
    ],
    onPause: () => {},
    onStart: () => {},
    onRemove: () => {},
    onEditKey: () => {},
    onSetKey: () => {},
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
    onEditKey: undefined,
    onSetKey: undefined,
    children: undefined,
  },
}

export const NewKey: Story = { args: { keyOf: 3 } }

export const RefusedNewKey: Story = {
  args: {
    keyOf: 3,
    change: { id: 3, failure: 'GitHub refused the key', field: 'key' },
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
