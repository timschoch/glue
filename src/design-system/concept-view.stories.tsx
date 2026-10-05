import type { Meta, StoryObj } from '@storybook/react-vite'

import { ConceptMap } from './concept-map.tsx'
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
      conceptTitle: 'UX study',
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
    onAddConcept: () => {},
  },
} satisfies Meta<typeof ConceptView>

export default meta

type Story = StoryObj<typeof meta>

export const AllTypes: Story = {}

export const BriefWithEmptySlots: Story = { args: { concept: brief } }

export const Empty: Story = {
  args: { concept: { ...concept, parts: [], linkedParts: [] } },
}

// Nothing can be added: the empty slots show their type alone.
export const ReadOnly: Story = {
  args: { concept: brief, onAddPart: undefined, onAddConcept: undefined },
}

export const WithConcepts: Story = {
  args: { concept: { ...brief, concepts } },
}

// The map in place of the list.
export const MapView: Story = {
  args: {
    view: 'map',
    map: (
      <ConceptMap
        tree={{
          slug: 'bake',
          title: 'Bake',
          concepts: [
            { slug: concept.slug, title: concept.title, concepts: [] },
          ],
        }}
        parts={concept.parts}
        joints={[
          { id: 1, part: 'D12', needs: 'G2', trust: 'solid' },
          { id: 2, part: 'D12', needs: 'I7', trust: 'solid' },
          { id: 3, part: 'D13', needs: 'I9', trust: 'flagged' },
          { id: 4, part: 'F5', needs: 'D12', trust: 'solid' },
          { id: 5, part: 'E3', needs: 'D12', trust: 'solid' },
          { id: 6, part: 'R4', needs: 'D13', trust: 'not-ready' },
          { id: 7, part: 'M1', needs: 'G2', trust: 'solid' },
        ]}
        focus={concept.slug}
        expanded={[]}
        onExpandedChange={() => {}}
        partHref={() => '#'}
        conceptHref={() => '#'}
        projectHref={() => '#'}
      />
    ),
    onViewChange: () => {},
  },
}

export const NarrowWindow: Story = {
  args: { concept: { ...brief, concepts } },
  globals: { viewport: { value: 'mobile1' } },
}

// A group of more than 6 cards is folded.
export const FortyParts: Story = {
  args: { concept: { ...concept, parts: manyParts } },
}

export const FortyPartsUnfolded: Story = {
  ...FortyParts,
  play: async ({ canvas, userEvent }) => {
    const [fold] = canvas.getAllByRole('button', { name: /^Show all/ })
    await userEvent.click(fold)
  },
}
