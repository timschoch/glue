import type { Meta, StoryObj } from '@storybook/react-vite'

import { PartForm } from './part-form.tsx'
import styles from './part-form.stories.module.scss'
import type { PartFormPart } from './part-form.tsx'

const parts: Array<PartFormPart> = [
  {
    id: 'G2',
    type: 'goal',
    title: 'First bake feels easy',
    trust: 'solid',
    href: '#',
  },
  {
    id: 'G3',
    type: 'goal',
    title: 'Bakers come back for a second bake',
    trust: 'flagged',
    href: '#',
  },
  {
    id: 'I7',
    type: 'insight',
    title: 'Bakers want step videos',
    trust: 'solid',
    href: '#',
  },
  {
    id: 'I9',
    type: 'insight',
    title: 'Videos are too long',
    trust: 'flagged',
    href: '#',
  },
  {
    id: 'I21',
    type: 'insight',
    title: 'Novices stop at long videos',
    trust: 'not-ready',
    href: '#',
  },
  {
    id: 'R4',
    type: 'guardrail',
    title: 'Only the videos of the creator',
    trust: 'solid',
    href: '#',
  },
]

const meta = {
  title: 'Part form',
  component: PartForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    parts,
    members: [
      { name: 'Mara', email: 'mara@example.com' },
      { name: 'Fred', email: 'fred@example.com' },
    ],
    onSave: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof PartForm>

export default meta

type Story = StoryObj<typeof meta>

export const AddInsight: Story = { args: { type: 'insight' } }

export const AddGoal: Story = { args: { type: 'goal' } }

export const AddDecision: Story = { args: { type: 'decision' } }

export const AddGuardrail: Story = { args: { type: 'guardrail' } }

export const AddEntity: Story = { args: { type: 'entity' } }

export const AddFlow: Story = { args: { type: 'flow' } }

export const AddMetric: Story = { args: { type: 'metric' } }

// A Decision with its Goal and its evidence picked.
export const AddDecisionWithPicks: Story = {
  args: {
    type: 'decision',
    values: {
      title: 'Show the video of the creator',
      body: [
        'Each technique of a recipe shows the video of its creator.',
        'It builds on #I7 and serves #G2.',
      ].join('\n\n'),
      responsible: 'mara@example.com',
      date: '2026-10-03',
      goal: 'G2',
      evidence: ['I7', 'I9', 'R4'],
    },
  },
}

// The list of the records after a # in the body.
export const BodyWithRecords: Story = {
  args: { type: 'decision' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Body' }),
      'It builds on #vid',
    )
  },
}

// A Decision that exists has its Goal, and no field for its evidence.
export const EditDecision: Story = {
  args: { ...AddDecisionWithPicks.args, recordId: 'D12' },
}

export const Saving: Story = {
  args: { ...AddDecisionWithPicks.args, pending: true },
}

export const WithErrors: Story = {
  args: {
    ...AddDecisionWithPicks.args,
    values: {
      ...AddDecisionWithPicks.args.values,
      title:
        'Show the video of the creator beside each step of the recipe, and keep it on the screen while the baker works with wet hands',
      body: 'It builds on #I30 and serves #G2.',
      date: '3 October',
    },
    errors: {
      title: 'Longer than 120 characters',
      body: '#I30 is not a record',
      date: 'Not a date',
      evidence: 'I9 is in review',
    },
    serverError: 'Not saved: the Goal G2 is sunk',
  },
}

export const NarrowWindow: Story = {
  args: AddDecisionWithPicks.args,
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
}
