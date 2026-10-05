import type { Meta, StoryObj } from '@storybook/react-vite'

import styles from './part-form.stories.module.scss'
import { People } from './people.tsx'

const meta = {
  title: 'People',
  component: People,
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
      {
        id: 1,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        loopSteps: ['understand', 'decide'],
        responsible: {
          concepts: [{ slug: 'part-model', title: 'Part model', href: '#' }],
          parts: [
            {
              id: 'D4',
              type: 'decision',
              title: 'The Concept lives in the database',
              trust: 'solid',
              href: '#',
            },
          ],
        },
        coAuthor: { concepts: [], parts: [] },
        watches: { concepts: [], parts: [] },
      },
      {
        id: 2,
        name: 'Bo Chen',
        email: 'bo@example.com',
        loopSteps: ['build'],
        responsible: { concepts: [], parts: [] },
        coAuthor: {
          concepts: [],
          parts: [
            {
              id: 'D4',
              type: 'decision',
              title: 'The Concept lives in the database',
              trust: 'solid',
              href: '#',
            },
          ],
        },
        watches: {
          concepts: [],
          parts: [
            {
              id: 'G1',
              type: 'goal',
              title: 'Agents build from the Concept',
              trust: 'solid',
              href: '#',
            },
          ],
        },
      },
    ],
    me: 1,
    onLoopStepsChange: () => {},
    onAddMember: () => {},
  },
} satisfies Meta<typeof People>

export default meta

type Story = StoryObj<typeof meta>

export const Member: Story = {}

export const ReadOnly: Story = {
  args: { me: null, onLoopStepsChange: undefined, onAddMember: undefined },
}

export const WithError: Story = {
  args: { error: 'No account has the e-mail address cy@example.com.' },
}
