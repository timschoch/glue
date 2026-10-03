import type { Meta, StoryObj } from '@storybook/react-vite'

import { Frame } from './frame.tsx'

const meta = {
  title: 'Frame',
  component: Frame,
  parameters: { layout: 'fullscreen' },
  args: {
    project: 'Bakeday',
    projects: ['Bakeday', 'Flexibeck'],
    onProjectChange: () => {},
    onUnpin: () => {},
    section: 'Decide',
    concepts: [
      { name: 'Technique videos', concepts: ['Step videos', 'Creator videos'] },
      { name: 'First bake' },
      { name: 'Shopping list' },
    ],
    conceptPath: ['Technique videos', 'Step videos'],
    trail: ['Show each technique', 'Videos are too long'],
  },
} satisfies Meta<typeof Frame>

export default meta

export const Default: StoryObj<typeof meta> = {}

export const Pinned: StoryObj<typeof meta> = {
  args: {
    pinned: [
      {
        type: 'insight',
        recordId: 'I7',
        title: 'Videos are too long',
        trust: 'flagged',
      },
      {
        type: 'decision',
        recordId: 'D12',
        title: 'Show each technique',
        trust: 'solid',
      },
    ],
  },
}

// A narrow window, with the left panel open over the main window.
export const PanelOpen: StoryObj<typeof meta> = {
  args: Pinned.args,
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }))
  },
}
