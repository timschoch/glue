import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Record } from './record.tsx'
import styles from './record.stories.module.scss'
import type { RecordPart, RecordPartSummary } from './record.tsx'

const insight: RecordPartSummary = {
  id: 'I7',
  type: 'insight',
  title: 'Bakers want step videos',
  concept: 'Technique videos',
  trust: 'solid',
  workState: 'published',
  href: '#',
}

const goal: RecordPartSummary = {
  id: 'G2',
  type: 'goal',
  title: 'First bake feels easy',
  concept: 'First bake',
  trust: 'solid',
  workState: 'published',
  href: '#',
}

const decision: RecordPartSummary = {
  id: 'D12',
  type: 'decision',
  title: 'Show the video of the creator',
  concept: 'Technique videos',
  trust: 'solid',
  workState: 'published',
  href: '#',
}

const guardrail: RecordPartSummary = {
  id: 'R4',
  type: 'guardrail',
  title: 'Only the videos of the creator',
  concept: 'Technique videos',
  trust: 'not-ready',
  workState: 'draft',
  href: '#',
}

const entity: RecordPartSummary = {
  id: 'E3',
  type: 'entity',
  title: 'Technique',
  concept: 'Technique videos',
  trust: 'solid',
  workState: 'published',
  href: '#',
}

const flow: RecordPartSummary = {
  id: 'F5',
  type: 'flow',
  title: 'Watch a technique while baking',
  concept: 'Technique videos',
  trust: 'flagged',
  workState: 'to-check',
  href: '#',
}

const metric: RecordPartSummary = {
  id: 'M1',
  type: 'metric',
  title: 'Ease of the first bake',
  concept: 'First bake',
  trust: 'solid',
  workState: 'published',
  href: '#',
}

// The fields that only some Part types have.
const noFields = {
  owner: 'Mara',
  date: '2026-10-03',
  source: null,
  metric: null,
  enforcedBy: null,
  evidenceLevel: null,
  issueUrl: null,
  measure: null,
  supersededBy: null,
  supersedes: [],
  needs: [],
  neededBy: [],
  signals: [],
  flags: [],
  activity: [{ kind: 'published', at: '2026-10-03T08:00:00.000Z' }],
} satisfies Partial<RecordPart>

const meta = {
  title: 'Record',
  component: Record,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className={styles.canvas}>
        <Story />
      </main>
    ),
  ],
  args: {
    bodyParts: [insight, goal, decision, guardrail, entity, flow, metric],
    pinned: false,
    onPinChange: () => {},
  },
  // The pin toggles in the story.
  render: function Render(args) {
    const [pinned, setPinned] = useState(args.pinned)
    return <Record {...args} pinned={pinned} onPinChange={setPinned} />
  },
} satisfies Meta<typeof Record>

export default meta

type Story = StoryObj<typeof meta>

export const Insight: Story = {
  args: {
    part: {
      ...insight,
      ...noFields,
      body: 'Eight of ten novices stop at stretch and fold. They ask for a video of each step.',
      evidenceLevel: 'pattern',
      source: 'Interviews with ten novices, May 2026',
      neededBy: [{ jointId: 1, link: false, part: decision }],
    },
  },
}

export const Goal: Story = {
  args: {
    part: {
      ...goal,
      ...noFields,
      body: 'A novice finishes the first loaf and says it was easy.',
      metric: 'Ease of the first bake',
      source: 'mock-analytics',
      measure: {
        baseline: 3.2,
        latestValue: 3.8,
        target: 4.2,
        measuredAt: '2026-10-02',
      },
      needs: [{ jointId: 2, link: false, part: metric }],
      neededBy: [{ jointId: 3, link: true, part: decision }],
    },
  },
}

export const Decision: Story = {
  args: {
    part: {
      ...decision,
      ...noFields,
      body: 'Each technique of a recipe shows the video of its creator. It builds on #I7 and serves #G2.\n\n- The video stays beside the step.\n- The baker starts it with one touch.',
      issueUrl: 'https://github.com/timschoch/glue/issues/162',
      needs: [
        { jointId: 1, link: false, part: insight },
        { jointId: 3, link: true, part: goal },
      ],
      neededBy: [
        { jointId: 4, link: false, part: flow },
        { jointId: 5, link: false, part: entity },
      ],
    },
  },
}

// The step bar and the next step of the common flow, with what happened.
export const WithCommonFlow: Story = {
  args: {
    ...Decision.args,
    part: {
      ...Decision.args.part,
      activity: [
        {
          kind: 'flag-closed',
          at: '2026-10-04T09:00:00.000Z',
          flag: { reason: 'changed', part: insight },
        },
        {
          kind: 'flag-opened',
          at: '2026-10-03T10:00:00.000Z',
          flag: { reason: 'changed', part: insight },
        },
        { kind: 'published', at: '2026-10-03T08:00:00.000Z' },
      ],
    },
    flow: {
      name: 'Decision to Brief',
      steps: ['Fill slots', 'Sign'],
      current: 1,
    },
    actions: [
      { label: 'Open Concept', onClick: () => {} },
      { label: 'Not ready', onClick: () => {} },
    ],
  },
}

export const Guardrail: Story = {
  args: {
    part: {
      ...guardrail,
      ...noFields,
      body: 'A recipe never shows the video of another creator.',
      enforcedBy: 'A test of the video player',
      neededBy: [{ jointId: 6, link: false, part: flow }],
    },
    actions: [{ label: 'Ask for review', onClick: () => {} }],
  },
}

export const Entity: Story = {
  args: {
    part: {
      ...entity,
      ...noFields,
      body: 'A baking task that a novice cannot do from its name alone.\n\n| Attribute | Type |\n| --- | --- |\n| Name | Text |\n| Video | Link |',
      needs: [
        { jointId: 5, link: false, part: decision },
        { jointId: 7, link: false, part: flow },
      ],
    },
  },
}

export const Flow: Story = {
  args: {
    part: {
      ...flow,
      ...noFields,
      body: '1. The baker opens a step of the recipe.\n2. The step names a #E3.\n3. The baker starts the video with one touch.',
      needs: [
        { jointId: 4, link: false, part: decision },
        { jointId: 6, link: false, part: guardrail },
        { jointId: 7, link: false, part: entity },
      ],
    },
    actions: [{ label: 'It is fine', onClick: () => {} }],
  },
}

export const Metric: Story = {
  args: {
    part: {
      ...metric,
      ...noFields,
      body: 'The mean answer to the question after the first bake, from 1 to 5.',
      source: 'mock-analytics',
      neededBy: [{ jointId: 2, link: false, part: goal }],
    },
  },
}

export const Superseded: Story = {
  args: {
    part: {
      ...decision,
      ...noFields,
      id: 'D9',
      title: 'Show a video of Bakeday',
      trust: 'wrong',
      workState: 'sunk',
      body: 'Each technique shows one video that Bakeday makes.',
      supersededBy: decision,
      supersedes: [
        {
          ...decision,
          id: 'D4',
          title: 'Show a drawing of each technique',
          trust: 'wrong',
          workState: 'sunk',
        },
      ],
    },
    pinned: true,
  },
}

export const NoJoint: Story = {
  args: {
    part: {
      ...decision,
      ...noFields,
      id: 'D13',
      title: 'Loop the video without sound',
      trust: 'not-ready',
      workState: 'draft',
      owner: null,
      body: '',
    },
  },
}

export const LongBody: Story = {
  args: {
    part: {
      ...Decision.args.part,
      title:
        'Show the video of the creator beside each step of the recipe, and keep it on the screen while the baker works with wet hands',
      body: [
        '## Why',
        'Each technique of a recipe shows the video of its creator. The video stays beside the step, and the baker starts it with one touch or with a word. It builds on #I7 and serves #G2, and it holds #R4.',
        'A novice does not know what stretch and fold looks like. The name of a technique does not help. A drawing shows one moment, and the hands move the whole time.',
        '## What changes',
        '- The step of a recipe names its #E3.',
        '- The video loops until the baker stops it.',
        '- The flow #F5 starts from the step, not from a menu.',
        '> I do not touch the phone with dough on my hands.',
        '## How it is measured',
        'The metric #M1 goes up by one point. See `survey sent` in the analytics and [the issue](https://github.com/timschoch/glue/issues/162).',
        '| Version | Ease |\n| --- | --- |\n| 1.4 | 3.2 |\n| 1.5 | 3.8 |',
        '```\nhttps://bakeday.example/recipes/sourdough/steps/stretch-and-fold?video=creator&loop=true&sound=off\n```',
      ].join('\n\n'),
    },
  },
}

// A record that can be changed: edit, actions, and Joints to add and remove.
export const Writable: Story = {
  args: {
    ...Decision.args,
    actions: [
      { label: 'Sign off', onClick: () => {} },
      { label: 'Ask for review', onClick: () => {} },
      {
        label: 'Remove',
        onClick: () => {},
        confirm: { title: 'Remove D12?', label: 'Remove D12' },
      },
    ],
    onEdit: () => {},
    jointParts: [insight, goal, decision, guardrail, entity, flow, metric],
    onAddJoint: () => {},
    onRemoveJoint: () => {},
  },
}

// The Part needs nothing yet: the group Needs holds the search alone.
export const WritableNoJoint: Story = {
  args: {
    ...NoJoint.args,
    onEdit: () => {},
    jointParts: Writable.args.jointParts,
    onAddJoint: () => {},
    onRemoveJoint: () => {},
  },
}

// A flagged record: the usual answer is the button, and each flag shows its
// reason and the card of its cause.
export const Flagged: Story = {
  args: {
    part: {
      ...Flow.args.part,
      flags: [
        { reason: 'changed', part: decision },
        { reason: 'not-ready', part: guardrail },
      ],
    },
    jointParts: [insight, goal, decision, guardrail, entity, flow, metric],
    actions: [
      { label: 'It is fine', onClick: () => {} },
      { label: 'Wait', pick: { label: 'Wait for', onPick: () => {} } },
      { label: 'I need time', onClick: () => {} },
      { label: 'Not ready', onClick: () => {} },
      {
        label: 'Sink it',
        onClick: () => {},
        confirm: { title: 'Sink Flow F5', label: 'Sink it' },
      },
    ],
  },
}

// A Decision in review takes an answer in words.
export const InReview: Story = {
  args: {
    part: { ...Decision.args.part, trust: 'not-ready', workState: 'review' },
    actions: [
      { label: 'Sign off', onClick: () => {} },
      {
        label: 'Sink it',
        onClick: () => {},
        confirm: { title: 'Sink Decision D12', label: 'Sink it' },
      },
    ],
  },
  render: function Render(args) {
    const [words, setWords] = useState('')
    return <Record {...args} words={{ value: words, onChange: setWords }} />
  },
}

export const ActionRuns: Story = {
  args: { ...Writable.args, pending: 'Signing off' },
}

export const ActionFailed: Story = {
  args: { ...Writable.args, error: 'Not signed off: the Goal G2 is sunk' },
}

// The dialog of an action that cannot be undone.
export const ConfirmRemove: Story = {
  args: {
    ...Decision.args,
    actions: [
      {
        label: 'Remove',
        onClick: () => {},
        confirm: { title: 'Remove D12?', label: 'Remove D12' },
      },
    ],
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Remove' }))
  },
}

export const NarrowWindow: Story = {
  args: Writable.args,
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
}
