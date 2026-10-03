import type { Meta, StoryObj } from '@storybook/react-vite'

import { ClickableTile } from '@carbon/react'

import { Frame } from './frame.tsx'

const meta = {
  title: 'Frame',
  component: Frame,
  parameters: { layout: 'fullscreen' },
  args: {
    project: 'Bakeday',
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
    pinned: ['Videos are too long', 'Show each technique'].map((record) => (
      <ClickableTile key={record} href="#">
        {record}
      </ClickableTile>
    )),
  },
}
