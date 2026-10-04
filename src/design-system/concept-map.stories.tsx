import type { Meta, StoryObj } from '@storybook/react-vite'

import { ConceptMap } from './concept-map.tsx'
import type { ConceptMapProps } from './concept-map.tsx'
import styles from './concept-view.stories.module.scss'

type Concept = ConceptMapProps['concept']
type Part = Concept['parts'][number]

function part(
  id: string,
  type: Part['type'],
  title: string,
  trust: Part['trust'] = 'solid',
): Part {
  return {
    id,
    type,
    title,
    status: null,
    concept: 'technique-videos',
    conceptTitle: 'Technique videos',
    trust,
  }
}

function joint(id: number, from: string, needs: string, twoWay = false) {
  return { id, part: from, needs, twoWay }
}

const concept: Concept = {
  concepts: [],
  parts: [
    part('G2', 'goal', 'First bake feels easy'),
    part('I7', 'insight', 'Bakers want step videos'),
    part('I9', 'insight', 'Videos are too long', 'flagged'),
    part('D12', 'decision', 'Show the video of the creator'),
    part('D13', 'decision', 'Loop the video without sound', 'not-ready'),
    part('F5', 'flow', 'Watch a technique while baking', 'flagged'),
    part('E3', 'entity', 'Technique'),
    part('E4', 'entity', 'Video'),
    part('R4', 'guardrail', 'Only the videos of the creator'),
    part('M1', 'metric', 'Ease of the first bake', 'wrong'),
  ],
  linkedParts: [
    {
      ...part('I21', 'insight', 'Novices stop at long videos'),
      concept: 'ux-study',
      conceptTitle: 'UX study',
    },
  ],
  slots: [],
  joints: [
    joint(1, 'D12', 'G2'),
    joint(2, 'D12', 'I7'),
    joint(3, 'D13', 'G2'),
    joint(4, 'D13', 'I9'),
    joint(5, 'D13', 'I21'),
    joint(6, 'F5', 'D12'),
    joint(7, 'F5', 'D13'),
    joint(8, 'E3', 'D12'),
    joint(9, 'E3', 'E4', true),
    joint(10, 'R4', 'D12'),
    joint(11, 'M1', 'G2'),
    joint(12, 'M1', 'F5'),
  ],
}

const brief: Concept = {
  ...concept,
  parts: concept.parts.slice(0, 5),
  linkedParts: [],
  slots: [
    { type: 'insight', filled: true },
    { type: 'goal', filled: true },
    { type: 'decision', filled: true },
    { type: 'metric', filled: false },
    { type: 'flow', filled: false },
    { type: 'entity', filled: false },
    { type: 'guardrail', filled: false },
  ],
}

const concepts: Concept['concepts'] = [
  {
    slug: 'step-videos',
    title: 'Step videos',
    kind: 'brief',
    partCount: 12,
    concepts: [],
  },
  {
    slug: 'creator-videos',
    title: 'Creator videos',
    kind: null,
    partCount: 1,
    concepts: [],
  },
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
    concept,
    partHref: () => '#',
    conceptHref: () => '#',
    onAddPart: () => {},
  },
} satisfies Meta<typeof ConceptMap>

export default meta

type Story = StoryObj<typeof meta>

export const AllTypes: Story = {}

export const BriefWithEmptySlots: Story = { args: { concept: brief } }

// Nothing can be added: the empty slots show their type alone.
export const ReadOnly: Story = {
  args: { concept: brief, onAddPart: undefined },
}

export const WithConcepts: Story = {
  args: { concept: { ...concept, concepts } },
}

// The lens of the section Decide.
export const Lens: Story = {
  args: { types: ['goal', 'decision'] },
}

export const Empty: Story = {
  args: { concept: { ...concept, parts: [], linkedParts: [], joints: [] } },
}

// The map scrolls in its own box.
export const NarrowWindow: Story = {
  globals: { viewport: { value: 'mobile1' } },
}
