import type { Meta, StoryObj } from '@storybook/react-vite'

import { ContractQuestions } from './contract-questions.tsx'
import { PlainFrame } from './frame.tsx'

const meta = {
  title: 'Contract questions',
  component: ContractQuestions,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: {
    questions: [
      {
        id: 2,
        version: 2,
        stale: false,
        text: 'Does a Technique need a video?',
        askedBy: 'build-agent',
        askedAt: '2026-10-03T09:00:00.000Z',
        answer: null,
      },
      {
        id: 1,
        version: 1,
        stale: true,
        text: 'How long is a video?',
        askedBy: 'Fred',
        askedAt: '2026-10-01T09:00:00.000Z',
        answer: {
          text: 'At most 30 seconds.',
          by: 'Mara',
          at: '2026-10-02T09:00:00.000Z',
        },
      },
    ],
    onAsk: () => {},
    onAnswer: () => {},
  },
} satisfies Meta<typeof ContractQuestions>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoQuestions: Story = { args: { questions: [] } }

// The list of Mine: the questions of more than one Concept, no new question.
export const Mine: Story = {
  args: {
    questions: [
      {
        id: 2,
        concept: { title: 'Technique videos', href: '#' },
        version: 2,
        stale: false,
        text: 'Does a Technique need a video?',
        askedBy: 'build-agent',
        askedAt: '2026-10-03T09:00:00.000Z',
        answer: null,
      },
    ],
    onAsk: undefined,
  },
}
