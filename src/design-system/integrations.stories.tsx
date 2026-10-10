import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  IntegrationForm,
  IntegrationSecret,
  Integrations,
} from './integrations.tsx'
import type { IntegrationFormProps } from './integrations.tsx'
import styles from './part-form.stories.module.scss'

const tools: IntegrationFormProps['tools'] = [
  {
    name: 'github',
    label: 'GitHub',
    addressFields: [{ label: 'Repository' }],
    needsKey: true,
  },
  {
    name: 'posthog',
    label: 'PostHog',
    addressFields: [
      {
        label: 'Region',
        options: [
          { value: 'us', label: 'US' },
          { value: 'eu', label: 'EU' },
        ],
      },
      { label: 'Project ID' },
    ],
    needsKey: true,
  },
  {
    name: 'webhook',
    label: 'Webhook',
    addressFields: [{ label: 'Name' }],
    needsKey: false,
  },
]

const form = <IntegrationForm tools={tools} onAdd={() => {}} />

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
        tool: 'GitHub',
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
        tool: 'PostHog',
        address: 'eu/12345',
        keyLastFour: 'wxyz',
        state: 'paused',
      },
      {
        id: 3,
        tool: 'GitHub',
        address: 'acme/app',
        keyLastFour: '9876',
        state: 'failed',
        lastRead: {
          at: '2026-10-10T07:05:00.000Z',
          signalCount: null,
          error: 'GitHub refused the key',
        },
      },
      {
        id: 4,
        tool: 'Webhook',
        address: 'Helpdesk',
        keyLastFour: 'abcd',
        state: 'active',
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
    change: {
      id: 3,
      failure: 'GitHub refused the key',
      field: 'key',
      isKey: true,
    },
  },
}

// A start that the tool refused: the stored key is wrong.
export const RefusedStart: Story = {
  args: {
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
        tools={tools}
        errors={{ key: 'GitHub refused the key' }}
        onAdd={() => {}}
      />
    ),
  },
}

export const NewWebhook: Story = {
  args: {
    children: (
      <>
        <IntegrationSecret
          name="Webhook Helpdesk"
          address="https://glue.example.com/api/v1/projects/glue/webhook"
          secret="secret-of-the-webhook-abcd"
        />
        {form}
      </>
    ),
  },
}
