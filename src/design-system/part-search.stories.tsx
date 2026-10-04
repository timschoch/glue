import type { Meta, StoryObj } from '@storybook/react-vite'

import { PartSearch } from './part-search.tsx'
import styles from './part-form.stories.module.scss'

const meta = {
  title: 'Part search',
  component: PartSearch,
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    id: 'search',
    label: 'Add Joint',
    parts: [
      {
        id: 'G2',
        type: 'goal',
        title: 'First bake feels easy',
        trust: 'solid',
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
        trust: 'not-ready',
        href: '#',
      },
    ],
    onPick: () => {},
  },
} satisfies Meta<typeof PartSearch>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WrongPick: Story = { args: { invalidText: 'I3 is sunk' } }
