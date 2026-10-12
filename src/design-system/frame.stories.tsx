import type { Meta, StoryObj } from '@storybook/react-vite'

import { Frame, PlainFrame } from './frame.tsx'
import { PartCards } from './part-cards.tsx'
import { Readings } from './part-cards.stories.tsx'

const meta = {
  title: 'Frame',
  component: Frame,
  parameters: { layout: 'fullscreen' },
  args: {
    project: 'Bakeday',
    projects: ['Bakeday', 'Flexibeck'],
    onProjectChange: () => {},
    onAddProject: () => {},
    onAddConcept: () => {},
    onSignOut: () => {},
    onUnpin: () => {},
    onOpen: (_href, event) => event.preventDefault(),
    section: 'Decide',
    mineHref: '/bakeday?section=Mine',
    peopleHref: '/bakeday?section=People',
    rootHref: '/bakeday',
    steps: [
      {
        name: 'Understand',
        href: '/bakeday/step-videos?section=Understand',
        hasParts: true,
      },
      { name: 'Decide', href: '/bakeday/step-videos', hasParts: true },
      {
        name: 'Design',
        href: '/bakeday/step-videos?section=Design',
        hasParts: false,
      },
      {
        name: 'Build',
        href: '/bakeday/step-videos?section=Build',
        hasParts: false,
      },
      { name: 'Use', href: '/bakeday/step-videos?section=Use', hasParts: true },
    ],
    concepts: [
      {
        name: 'Technique videos',
        href: '/bakeday/technique-videos',
        concepts: [
          { name: 'Step videos', href: '/bakeday/step-videos' },
          { name: 'Creator videos', href: '/bakeday/creator-videos' },
        ],
      },
      { name: 'First bake', href: '/bakeday/first-bake' },
      { name: 'Shopping list', href: '/bakeday/shopping-list' },
    ],
    conceptPath: [
      { name: 'Technique videos', href: '/bakeday/technique-videos' },
      { name: 'Step videos', href: '/bakeday/step-videos' },
    ],
    trail: [
      { name: 'Show each technique', href: '/bakeday/step-videos/D12' },
      { name: 'Videos are too long', href: '/bakeday/step-videos/I7' },
    ],
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
        href: '/bakeday/step-videos/I7',
      },
      {
        type: 'decision',
        recordId: 'D12',
        title: 'Show each technique',
        trust: 'solid',
        href: '/bakeday/step-videos/D12',
      },
    ],
  },
}

// No section is chosen: the main window shows every Part type.
export const NoSection: StoryObj<typeof meta> = {
  args: { section: undefined },
}

// The Project itself is open: its item in the left panel is the current one.
export const ProjectOpen: StoryObj<typeof meta> = {
  args: { section: undefined, conceptPath: [], trail: [] },
}

// A Concept with no Parts: each loop step is empty.
export const NoParts: StoryObj<typeof meta> = {
  args: {
    section: undefined,
    steps: meta.args.steps.map((step) => ({ ...step, hasParts: false })),
  },
}

// Mine belongs to the Project: no Concept is open, so no loop steps.
export const Mine: StoryObj<typeof meta> = {
  args: {
    section: 'Mine',
    newFlagCount: 2,
    steps: undefined,
    conceptPath: [],
    trail: [],
  },
}

// The section Use: the Metrics and the measured Goals of the Project, each
// with its newest value against its target.
export const Use: StoryObj<typeof meta> = {
  args: {
    section: 'Use',
    conceptPath: [],
    trail: [],
    children: <PartCards title="Use" parts={Readings.args?.parts ?? []} />,
  },
}

// No Project and no Concept can be added, and nobody is signed in.
export const ReadOnly: StoryObj<typeof meta> = {
  args: {
    onAddProject: undefined,
    onAddConcept: undefined,
    onSignOut: undefined,
  },
}

// The sign-out runs.
export const SigningOut: StoryObj<typeof meta> = {
  args: { signOutPending: 'Signing out' },
}

// The server gave no answer to the sign-out.
export const SignOutFailure: StoryObj<typeof meta> = {
  args: {
    signOutFailure: 'This did not work. Check your connection, then try again.',
  },
}

// A screen that has no Project.
export const Plain: StoryObj<typeof meta> = {
  render: () => <PlainFrame />,
}

// A narrow window, with the left panel open over the main window.
export const PanelOpen: StoryObj<typeof meta> = {
  args: Pinned.args,
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }))
  },
}
