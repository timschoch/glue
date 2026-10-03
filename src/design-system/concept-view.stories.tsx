import type { Meta, StoryObj } from '@storybook/react-vite'

import { ConceptView } from './concept-view.tsx'
import type { ConceptViewPart, ConceptViewProps } from './concept-view.tsx'
import styles from './concept-view.stories.module.scss'

type Concept = ConceptViewProps['concept']

function part(
  id: string,
  type: ConceptViewPart['type'],
  title: string,
  trust: ConceptViewPart['trust'] = 'solid',
): ConceptViewPart {
  return { id, type, title, status: null, concept: 'technique-videos', trust }
}

const concept: Concept = {
  slug: 'technique-videos',
  title: 'Technique videos',
  kind: null,
  concepts: [],
  parts: [
    part('I7', 'insight', 'Bakers want step videos'),
    part('I9', 'insight', 'Videos are too long', 'flagged'),
    part('G2', 'goal', 'First bake feels easy'),
    part('D12', 'decision', 'Show the video of the creator'),
    part('D13', 'decision', 'Loop the video without sound', 'not-ready'),
    part('E3', 'entity', 'Technique'),
    part('F5', 'flow', 'Watch a technique while baking', 'flagged'),
    part('R4', 'guardrail', 'Only the videos of the creator'),
    part('M1', 'metric', 'Ease of the first bake', 'wrong'),
  ],
  linkedParts: [
    {
      ...part('I21', 'insight', 'Novices stop at long videos'),
      concept: 'ux-study',
    },
  ],
  slots: [],
}

const brief: Concept = {
  ...concept,
  kind: 'brief',
  parts: concept.parts.slice(0, 4),
  slots: [
    { type: 'insight', filled: true },
    { type: 'goal', filled: true },
    { type: 'decision', filled: true },
    { type: 'metric', filled: false },
    { type: 'flow', filled: false },
    { type: 'entity', filled: false },
    { type: 'guardrail', filled: true },
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
  {
    slug: 'video-player',
    title: 'Video player',
    kind: 'brief',
    partCount: 0,
    concepts: [],
  },
]

const PART_COUNT = 40

// The 40 Parts take the seven types in turn.
const manyParts = Array.from({ length: PART_COUNT }, (_, index) => {
  const { id, type, title, trust } = concept.parts[index % concept.parts.length]
  return part(`${id.slice(0, 1)}${index + 1}`, type, title, trust)
})

const meta = {
  title: 'Concept view',
  component: ConceptView,
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
} satisfies Meta<typeof ConceptView>

export default meta

type Story = StoryObj<typeof meta>

export const AllTypes: Story = {}

export const BriefWithEmptySlots: Story = { args: { concept: brief } }

export const Empty: Story = {
  args: { concept: { ...concept, parts: [], linkedParts: [] } },
}

export const WithConcepts: Story = {
  args: { concept: { ...brief, concepts } },
}

// The lens of the section Decide.
export const Lens: Story = {
  args: { concept: brief, types: ['goal', 'decision', 'guardrail'] },
}

export const NarrowWindow: Story = {
  args: { concept: { ...brief, concepts } },
  globals: { viewport: { value: 'mobile1' } },
}

export const FortyParts: Story = {
  args: { concept: { ...concept, parts: manyParts } },
}
