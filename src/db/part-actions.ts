import { z } from 'zod'

import { createDownstreamIssue } from '../github/downstream-issue.ts'
import {
  addConcept,
  addJoint,
  addPart,
  newConceptSchema,
  newJointSchema,
  newPartSchema,
  partChangeSchema,
  removeJoint,
  updatePart,
} from './part-records.ts'
import {
  findConcept,
  findPart,
  findProject,
  listParts,
  listProjects,
} from './parts.ts'
import * as schema from './schema.ts'
import { createSessionGuard, toFailure } from './session-actions.ts'
import type { ActionRequest } from './session-actions.ts'

// The input of the server functions of the Part model. Each one names its
// Project.
export const projectInputSchema = z.object({ project: z.string() })

export const conceptReadInputSchema = projectInputSchema.extend({
  concept: z.string(),
})

export const partListInputSchema = projectInputSchema.extend({
  types: z.array(z.enum(schema.partTypes)).optional(),
})

export const partReadInputSchema = projectInputSchema.extend({
  recordId: z.string(),
})

export const conceptAddInputSchema = projectInputSchema.extend({
  concept: newConceptSchema,
})

export const partAddInputSchema = projectInputSchema.extend({
  part: newPartSchema,
})

export const partUpdateInputSchema = partReadInputSchema.extend({
  change: partChangeSchema,
})

export const jointAddInputSchema = projectInputSchema.extend({
  joint: newJointSchema,
})

export const jointRemoveInputSchema = projectInputSchema.extend({
  jointId: z.int(),
})

type ProjectInput = z.infer<typeof projectInputSchema>
type ConceptReadInput = z.infer<typeof conceptReadInputSchema>
type PartListInput = z.infer<typeof partListInputSchema>
type PartReadInput = z.infer<typeof partReadInputSchema>
type ConceptAddInput = z.infer<typeof conceptAddInputSchema>
type PartAddInput = z.infer<typeof partAddInputSchema>
type PartUpdateInput = z.infer<typeof partUpdateInputSchema>
type JointAddInput = z.infer<typeof jointAddInputSchema>
type JointRemoveInput = z.infer<typeof jointRemoveInputSchema>

// A write of a Part that worked. When GitHub failed, the Part is saved and
// the downstream issue of the Decision is missing.
export type SavedPart = { id: string; issueMissing: boolean }

// What the server functions of the Part model do. Each action looks for the
// session first. The server functions parse the input. The reads and the
// writes are the ones of the CLI and the HTTP API.
export function createPartActions(request: ActionRequest) {
  const { getDb, getGithub } = request
  const withSession = createSessionGuard(request)

  async function toSavedPart(project: string, id: string): Promise<SavedPart> {
    const issue = await createDownstreamIssue(getDb(), getGithub(), project, id)
    return { id, issueMissing: issue.kind === 'failed' }
  }

  return {
    listProjects: withSession((db) => listProjects(db)),

    findProject: withSession((db, { project }: ProjectInput) =>
      findProject(db, project),
    ),

    findConcept: withSession((db, { project, concept }: ConceptReadInput) =>
      findConcept(db, project, concept),
    ),

    listParts: withSession((db, { project, types }: PartListInput) =>
      listParts(db, project, types),
    ),

    findPart: withSession((db, { project, recordId }: PartReadInput) =>
      findPart(db, project, recordId),
    ),

    addConcept: withSession((db, { project, concept }: ConceptAddInput) =>
      addConcept(db, project, concept).then((slug) => ({ slug }), toFailure),
    ),

    addPart: withSession((db, { project, part }: PartAddInput) =>
      addPart(db, project, part)
        .then((id) => toSavedPart(project, id))
        .catch(toFailure),
    ),

    updatePart: withSession(
      (db, { project, recordId, change }: PartUpdateInput) =>
        updatePart(db, project, recordId, change)
          .then(() => toSavedPart(project, recordId))
          .catch(toFailure),
    ),

    addJoint: withSession((db, { project, joint }: JointAddInput) =>
      addJoint(db, project, joint).then((id) => ({ id }), toFailure),
    ),

    removeJoint: withSession((db, { project, jointId }: JointRemoveInput) =>
      removeJoint(db, project, jointId).then(() => undefined, toFailure),
    ),
  }
}
