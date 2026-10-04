import { describe, expect, it } from 'vitest'

import { findProject } from '../test/project.ts'
import { findConceptPath } from './project-frame.tsx'

const root = findProject('glue')!.concept

function path(slug: string): Array<string> {
  return findConceptPath(root, slug).map((concept) => concept.slug)
}

describe('findConceptPath', () => {
  it('starts at the root Concept and ends at the Concept', () => {
    expect(path('read-model')).toEqual(['glue', 'part-model', 'read-model'])
  })

  it('is the root Concept alone for the root Concept', () => {
    expect(path('glue')).toEqual(['glue'])
  })

  it('is the root Concept alone for a Concept that the Project does not have', () => {
    expect(path('nope')).toEqual(['glue'])
  })
})
