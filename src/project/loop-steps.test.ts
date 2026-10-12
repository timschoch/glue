import { describe, expect, it } from 'vitest'

import type { ConceptNode } from '../db/parts.ts'
import { listLoopSteps } from './loop-steps.ts'

function node(slug: string, concepts: Array<ConceptNode> = []): ConceptNode {
  return { slug, title: slug, kind: null, partCount: 0, concepts }
}

const VIDEOS = node('videos', [node('step-videos')])

describe('listLoopSteps', () => {
  it('lists the five steps in loop order, each with no Parts in a Concept with no Parts', () => {
    expect(listLoopSteps(VIDEOS, [], [])).toEqual([
      { name: 'Understand', hasParts: false },
      { name: 'Decide', hasParts: false },
      { name: 'Design', hasParts: false },
      { name: 'Build', hasParts: false },
      { name: 'Use', hasParts: false },
    ])
  })

  it('says that a step has Parts when the Concept has a Part of a type of the step', () => {
    const steps = listLoopSteps(
      VIDEOS,
      [
        { type: 'insight', concept: 'videos' },
        { type: 'entity', concept: 'videos' },
      ],
      [],
    )

    expect(steps.filter(({ hasParts }) => hasParts)).toEqual([
      { name: 'Understand', hasParts: true },
      { name: 'Design', hasParts: true },
      { name: 'Build', hasParts: true },
    ])
  })

  it('counts the Parts of a Concept inside the Concept, and no Part of another Concept', () => {
    const steps = listLoopSteps(
      VIDEOS,
      [
        { type: 'goal', concept: 'step-videos' },
        { type: 'insight', concept: 'first-bake' },
      ],
      [],
    )

    expect(steps.filter(({ hasParts }) => hasParts)).toEqual([
      { name: 'Decide', hasParts: true },
    ])
  })

  it('says that Use has Parts when the Concept has a measured Part, as the section Use lists it', () => {
    const steps = listLoopSteps(
      VIDEOS,
      [{ type: 'goal', concept: 'videos' }],
      [{ concept: 'videos' }],
    )

    expect(steps.at(-1)).toEqual({ name: 'Use', hasParts: true })
  })
})
