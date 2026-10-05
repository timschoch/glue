import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import type { MapConcept, MapJoint, MapPart } from './concept-map-layout.ts'
import { ConceptMap } from './concept-map.tsx'
import styles from './concept-view.stories.module.scss'

const tree: MapConcept = {
  slug: 'bake',
  title: 'Bake',
  concepts: [
    {
      slug: 'recipes',
      title: 'Recipes',
      concepts: [
        { slug: 'steps', title: 'Steps', concepts: [] },
        { slug: 'ingredients', title: 'Ingredients', concepts: [] },
      ],
    },
    { slug: 'technique-videos', title: 'Technique videos', concepts: [] },
    { slug: 'ux-study', title: 'UX study', concepts: [] },
    { slug: 'shop', title: 'Shop', concepts: [] },
  ],
}

function part(
  id: string,
  type: MapPart['type'],
  title: string,
  concept: string,
  trust: MapPart['trust'] = 'solid',
): MapPart {
  return { id, type, title, trust, concept }
}

const parts = [
  part('G2', 'goal', 'First bake feels easy', 'bake'),
  part('E1', 'entity', 'Step', 'steps'),
  part('E2', 'entity', 'Ingredient', 'ingredients', 'flagged'),
  part('I7', 'insight', 'Bakers want step videos', 'technique-videos'),
  part('D12', 'decision', 'Show the video of the creator', 'technique-videos'),
  part(
    'D13',
    'decision',
    'Loop the video without sound',
    'technique-videos',
    'not-ready',
  ),
  part('E4', 'entity', 'Video', 'technique-videos'),
  part('I21', 'insight', 'Novices stop at long videos', 'ux-study', 'wrong'),
]

function joint(
  id: number,
  from: string,
  needs: string,
  reference?: MapJoint['reference'],
): MapJoint {
  const trust = parts.find((needed) => needed.id === needs)?.trust ?? 'solid'
  return { id, part: from, needs, trust, reference }
}

const joints = [
  joint(1, 'D12', 'G2'),
  joint(2, 'D12', 'I7'),
  joint(3, 'D13', 'I7'),
  joint(4, 'D13', 'I21'),
  joint(5, 'E4', 'D12'),
  joint(6, 'E4', 'E1'),
  joint(7, 'E1', 'E2'),
  joint(8, 'D12', 'E2'),
  joint(9, 'E4', 'E9', { end: 'needs', slug: 'media', name: 'Media' }),
]

const meta = {
  title: 'Concept map',
  component: ConceptMap,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    tree,
    parts,
    joints,
    focus: 'bake',
    expanded: [],
    onExpandedChange: () => {},
    partHref: () => '#',
    conceptHref: () => '#',
    projectHref: () => '#',
  },
  // A click opens and closes a Concept, as the address does in the app.
  render: function Render(args) {
    const [expanded, setExpanded] = useState(args.expanded)

    return (
      <ConceptMap
        {...args}
        expanded={expanded}
        onExpandedChange={setExpanded}
      />
    )
  },
} satisfies Meta<typeof ConceptMap>

export default meta

type Story = StoryObj<typeof meta>

// The Map of a Project: each top-level Concept closed, in the order of the
// tree.
export const ProjectClosed: Story = {}

// One Concept open in place, with its Parts.
export const OneOpen: Story = { args: { expanded: ['technique-videos'] } }

// An open Concept that holds Concepts shows them, not its Parts.
export const OpenWithConcepts: Story = { args: { expanded: ['recipes'] } }

// The Map of a Concept: the Concepts glued to it are closed, before and
// after it.
export const OneConcept: Story = { args: { focus: 'technique-videos' } }

// The lens of the section Decide.
export const Lens: Story = {
  args: {
    parts: parts.filter(({ type }) => type === 'goal' || type === 'decision'),
    expanded: ['technique-videos'],
  },
}

export const Empty: Story = { args: { parts: [], joints: [] } }

export const NarrowWindow: Story = {
  globals: { viewport: { value: 'mobile1' } },
}
