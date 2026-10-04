import type { Meta, StoryObj } from '@storybook/react-vite'

import { ContractPanel, ContractVersionView } from './contract.tsx'
import type { ContractPanelProps } from './contract.tsx'
import styles from './concept-view.stories.module.scss'

const versions: ContractPanelProps['versions'] = [
  {
    version: 2,
    checksum:
      'a81d03c5e7f9124b6d8fa0c2e4b6d8fa0c2e4b6d8fa0c2e4b6d8fa0c2e4b6d8f',
    signedBy: 'Ada',
    signedAt: '2026-10-04T08:30:00.000Z',
  },
  {
    version: 1,
    checksum:
      '9f2c4e7a1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd',
    signedBy: 'Grace',
    signedAt: '2026-10-01T10:00:00.000Z',
  },
]

const blocking: ContractPanelProps['blocking'] = [
  {
    id: 'F5',
    type: 'flow',
    title: 'Watch a technique while baking',
    trust: 'flagged',
    href: '#',
  },
  {
    id: 'D13',
    type: 'decision',
    title: 'Loop the video without sound',
    trust: 'not-ready',
    href: '#',
  },
]

const meta = {
  title: 'Contract',
  component: ContractPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    versions,
    ahead: false,
    blocking: [],
    versionHref: () => '#',
    onSignOff: () => {},
  },
} satisfies Meta<typeof ContractPanel>

export default meta

type Story = StoryObj<typeof meta>

export const Signed: Story = {}

export const Ahead: Story = { args: { ahead: true } }

export const NoVersion: Story = { args: { versions: [] } }

// The cause of the grey button is above it.
export const Blocked: Story = { args: { ahead: true, blocking } }

export const Failed: Story = {
  args: { ahead: true, failure: 'sign-off needs Trust solid: F5' },
}

// A frozen Version: text, no control. It is superseded and its Brief has
// two empty slots.
export const Version: Story = {
  render: () => (
    <ContractVersionView
      contract={{
        ...versions[1],
        title: 'Technique videos',
        kind: 'brief',
        newestVersion: 2,
        tier1: [
          {
            id: 'F5',
            type: 'flow',
            title: 'Watch a technique while baking',
            body: 'The baker opens a step.\nThe video of the step loops.',
          },
          { id: 'E3', type: 'entity', title: 'Technique', body: '' },
          {
            id: 'R4',
            type: 'guardrail',
            title: 'Only the videos of the creator',
            body: 'Must not show a video of another creator.',
          },
        ],
        tier2: [
          {
            id: 'G2',
            type: 'goal',
            title: 'First bake feels easy',
            body: '',
          },
          {
            id: 'D12',
            type: 'decision',
            title: 'Show the video of the creator',
            body: 'It follows G2.',
          },
        ],
        slots: [
          { type: 'insight', filled: false },
          { type: 'goal', filled: true },
          { type: 'decision', filled: true },
          { type: 'metric', filled: false },
          { type: 'flow', filled: true },
          { type: 'entity', filled: true },
          { type: 'guardrail', filled: true },
        ],
      }}
      newestHref="#"
    />
  ),
}
