import type { Meta, StoryObj } from '@storybook/react-vite'

import { PlainFrame } from './frame.tsx'
import { PageState } from './page-state.tsx'

const meta = {
  title: 'Page state',
  component: PageState,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: { title: 'No record D9' },
} satisfies Meta<typeof PageState>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithLink: Story = {
  args: { title: 'No Project nope', link: { name: 'Glue', href: '#' } },
}
