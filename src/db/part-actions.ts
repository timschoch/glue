import { z } from 'zod'

import { createDownstreamIssue } from '../github/downstream-issue.ts'
import { listBuilds } from './builds.ts'
import {
  addMember,
  assign,
  assignmentTargetSchema,
  joinProject,
  listAssignments,
  listMembers,
  loopStepsSchema,
  newAssignmentSchema,
  setLoopSteps,
  unassign,
} from './members.ts'
import type { People } from './members.ts'
import {
  addSignalInsight,
  listSignals,
  signalInsightSchema,
} from './signals.ts'
import {
  addConcept,
  addJoint,
  addPart,
  addProject,
  answerPart,
  expectedPartSchema,
  newConceptSchema,
  newJointSchema,
  newPartSchema,
  partAnswerSchema,
  partChangeSchema,
  removeJoint,
  updatePart,
} from './part-records.ts'
import { InvalidRecordError } from './record-errors.ts'
import {
  findConcept,
  findPart,
  findProject,
  listMine,
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

// `expected` holds the values that the person saw. The write changes
// nothing when the Part has other values now.
export const partUpdateInputSchema = partReadInputSchema.extend({
  change: partChangeSchema,
  expected: expectedPartSchema.optional(),
})

export const projectAddInputSchema = z.object({
  slug: newConceptSchema.shape.slug,
  name: newConceptSchema.shape.title,
})

export const answerInputSchema = partReadInputSchema.extend({
  answer: partAnswerSchema,
})

export const jointAddInputSchema = projectInputSchema.extend({
  joint: newJointSchema,
})

export const jointRemoveInputSchema = projectInputSchema.extend({
  jointId: z.int(),
})

export const signalInsightAddInputSchema = projectInputSchema.extend({
  insight: signalInsightSchema,
})

export const memberAddInputSchema = projectInputSchema.extend({
  email: z.string().trim().min(1),
})

export const loopStepsInputSchema = projectInputSchema.extend({
  loopSteps: loopStepsSchema,
})

export const assignInputSchema = projectInputSchema.extend({
  assignment: newAssignmentSchema,
})

export const unassignInputSchema = projectInputSchema.extend({
  assignment: assignmentTargetSchema,
})

export type MemberAddInput = z.infer<typeof memberAddInputSchema>
export type LoopStepsInput = z.infer<typeof loopStepsInputSchema>
export type AssignInput = z.infer<typeof assignInputSchema>
export type UnassignInput = z.infer<typeof unassignInputSchema>

type ProjectInput = z.infer<typeof projectInputSchema>
export type SignalInsightAddInput = z.input<typeof signalInsightAddInputSchema>
type ConceptReadInput = z.infer<typeof conceptReadInputSchema>
type PartListInput = z.infer<typeof partListInputSchema>
type PartReadInput = z.infer<typeof partReadInputSchema>
export type ConceptAddInput = z.infer<typeof conceptAddInputSchema>
export type PartAddInput = z.infer<typeof partAddInputSchema>
export type PartUpdateInput = z.infer<typeof partUpdateInputSchema>
export type ProjectAddInput = z.infer<typeof projectAddInputSchema>
export type AnswerInput = z.infer<typeof answerInputSchema>
export type JointAddInput = z.infer<typeof jointAddInputSchema>
export type JointRemoveInput = z.infer<typeof jointRemoveInputSchema>

// A write of a Part that worked. When GitHub failed, the Part is saved and
// the downstream issue of the Decision is missing.
export type SavedPart = { id: string; issueMissing: boolean }

// A guarded write found the Part in another state than the person saw.
function toChangedError(recordId: string) {
  return new InvalidRecordError(`"${recordId}" changed since you opened it`)
}

// What the server functions of the Part model do. Each action looks for the
// session first. The server functions parse the input. The reads and the
// writes are the ones of the CLI and the HTTP API.
export function createPartActions(request: ActionRequest) {
  const { getDb, getGithub } = request
  const { withSession, withReader, withMember, withUser } =
    createSessionGuard(request)

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

    addConcept: withMember((db, { project, concept }: ConceptAddInput) =>
      addConcept(db, project, concept).then((slug) => ({ slug }), toFailure),
    ),

    addPart: withMember((db, { project, part }: PartAddInput) =>
      addPart(db, project, part)
        .then((id) => toSavedPart(project, id))
        .catch(toFailure),
    ),

    updatePart: withMember(
      (db, { project, recordId, change, expected }: PartUpdateInput) =>
        updatePart(db, project, recordId, change, expected)
          .then((changed) => {
            if (!changed) throw toChangedError(recordId)
            return toSavedPart(project, recordId)
          })
          .catch(toFailure),
    ),

    // An answer in words carries the name of the member.
    answerPart: withMember(
      (db, { project, recordId, answer }: AnswerInput, member) =>
        answerPart(db, project, recordId, { ...answer, by: member.name })
          .then(() => toSavedPart(project, recordId))
          .catch(toFailure),
    ),

    listMine: withReader((db, { project }: ProjectInput, member) =>
      listMine(db, project, member?.email),
    ),

    // The person who adds a Project is its first member.
    addProject: withUser(async (db, { slug, name }: ProjectAddInput, user) => {
      if (await findProject(db, slug))
        return { message: `project "${slug}" exists already` }
      await addProject(db, slug, name)
      await joinProject(db, slug, user)
      return { slug }
    }),

    listSignals: withSession((db, { project }: ProjectInput) =>
      listSignals(db, getGithub(), project),
    ),

    listBuilds: withSession((db, { project }: ProjectInput) =>
      listBuilds(db, getGithub(), project),
    ),

    addSignalInsight: withMember(
      (db, { project, insight }: SignalInsightAddInput) =>
        addSignalInsight(db, getGithub(), project, insight).then(
          (id): SavedPart => ({ id, issueMissing: false }),
          toFailure,
        ),
    ),

    addJoint: withMember((db, { project, joint }: JointAddInput) =>
      addJoint(db, project, joint).then((id) => ({ id }), toFailure),
    ),

    removeJoint: withMember((db, { project, jointId }: JointRemoveInput) =>
      removeJoint(db, project, jointId).then(() => undefined, toFailure),
    ),

    findPeople: withReader(
      async (db, { project }: ProjectInput, member): Promise<People> => {
        const [members, assignments] = await Promise.all([
          listMembers(db, project),
          listAssignments(db, project),
        ])
        return { members, assignments, me: member?.id ?? null }
      },
    ),

    addMember: withMember((db, { project, email }: MemberAddInput) =>
      addMember(db, project, email).catch(toFailure),
    ),

    // A member sets the own loop steps.
    setLoopSteps: withMember(
      (db, { project, loopSteps }: LoopStepsInput, member) =>
        setLoopSteps(db, project, member.id, loopSteps).then(
          () => undefined,
          toFailure,
        ),
    ),

    assign: withMember((db, { project, assignment }: AssignInput) =>
      assign(db, project, assignment).then(() => undefined, toFailure),
    ),

    unassign: withMember((db, { project, assignment }: UnassignInput) =>
      unassign(db, project, assignment).then(() => undefined, toFailure),
    ),
  }
}
