import type { Meta, StoryObj } from '@storybook/react-vite'

import { Builds } from './builds.tsx'
import { PlainFrame } from './frame.tsx'

const meta = {
  title: 'Build list',
  component: Builds,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PlainFrame>
        <Story />
      </PlainFrame>
    ),
  ],
  args: {
    builds: [
      {
        number: 208,
        url: 'https://github.com/timschoch/glue/pull/208',
        title: 'Show the builds of the Project',
        state: 'open',
        decisions: [
          {
            id: 'D28',
            type: 'decision',
            title: 'A build names its Contract Version',
            trust: 'solid',
            href: '#',
          },
        ],
        contract: null,
        stale: false,
        gate: 'holds',
        guardrails: [],
      },
      {
        number: 191,
        url: 'https://github.com/timschoch/glue/pull/191',
        title: 'Sign off a Concept as a Contract Version',
        state: 'merged',
        decisions: [],
        contract: { title: 'Part model', version: 2, href: '#' },
        stale: true,
        gate: 'breaks',
        guardrails: [
          {
            id: 'R3',
            title: 'Each build names its Decision',
            href: '#',
            state: 'passed',
          },
          {
            id: 'R4',
            title: 'A source change comes with a test change',
            href: '#',
            state: 'failed',
          },
          {
            id: 'R6',
            title: 'No text that describes the UI',
            href: '#',
            state: 'by-person',
          },
        ],
      },
      {
        number: 187,
        url: 'https://github.com/timschoch/glue/pull/187',
        title: 'Write with Carbon',
        state: 'merged',
        decisions: [],
        contract: null,
        stale: false,
        gate: null,
        guardrails: [],
      },
    ],
  },
} satisfies Meta<typeof Builds>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoBuilds: Story = { args: { builds: [] } }

export const NoRepository: Story = {
  args: { builds: [], reason: 'The Project has no repository' },
}
