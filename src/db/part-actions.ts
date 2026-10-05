import { z } from 'zod'

import type { Failure } from '../authentication/session.ts'
import { listBuilds } from './builds.ts'
import {
  addMember,
  assign,
  assignmentTargetSchema,
  joinProject,
  listAssignments,
  listMembers,
  listWatchers,
  loopStepsSchema,
  newAssignmentSchema,
  setLoopSteps,
  unassign,
  unwatch,
  watch,
} from './members.ts'
import type { People } from './members.ts'
import { listSignals, signalInsightSchema } from './signals.ts'
import type { ConceptDb } from './client.ts'
import { createPartOperations } from './part-operations.ts'
import type { ChangedPart } from './part-operations.ts'
import {
  addConcept,
  addJoint,
  addProject,
  expectedPartSchema,
  newConceptSchema,
  newJointSchema,
  newPartSchema,
  partAnswerSchema,
  partChangeSchema,
  questionAnswerSchema,
  removeConcept,
  removeJoint,
} from './part-records.ts'
import {
  findConcept,
  findPart,
  findProject,
  listMeasured,
  listMine,
  listParts,
  listProjects,
  listWatched,
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

// Without `named`: the builds of the Project.
export const buildsInputSchema = projectInputSchema.extend({
  named: z
    .union([
      z.object({ decision: z.string() }),
      z.object({ concept: z.string() }),
    ])
    .optional(),
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

export const questionAnswerInputSchema = partReadInputSchema.extend({
  answer: questionAnswerSchema,
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
export type ConceptReadInput = z.infer<typeof conceptReadInputSchema>
type PartListInput = z.infer<typeof partListInputSchema>
export type PartReadInput = z.infer<typeof partReadInputSchema>
type BuildsInput = z.infer<typeof buildsInputSchema>
export type ConceptAddInput = z.infer<typeof conceptAddInputSchema>
export type PartAddInput = z.infer<typeof partAddInputSchema>
export type PartUpdateInput = z.infer<typeof partUpdateInputSchema>
export type ProjectAddInput = z.infer<typeof projectAddInputSchema>
export type AnswerInput = z.infer<typeof answerInputSchema>
export type QuestionAnswerInput = z.infer<typeof questionAnswerInputSchema>
export type JointAddInput = z.infer<typeof jointAddInputSchema>
export type JointRemoveInput = z.infer<typeof jointRemoveInputSchema>

// A write of a Part that worked. When GitHub failed, the Part is saved and
// the downstream issue of the Decision is missing.
export type SavedPart = { id: string; issueMissing: boolean }

function toSavedPart({ part, issue }: ChangedPart): SavedPart {
  return { id: part.id, issueMissing: issue.kind === 'failed' }
}

// What the server functions of the Part model do. Each action looks for the
// session first. The server functions parse the input. The reads and the
// writes are the ones of the CLI and the HTTP API.
export function createPartActions(request: ActionRequest) {
  const { getGithub } = request
  const { withSession, withReader, withMember, withUser } =
    createSessionGuard(request)

  const toOperations = (db: ConceptDb) =>
    createPartOperations({ db, github: getGithub() })

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

    removeConcept: withMember((db, { project, concept }: ConceptReadInput) =>
      removeConcept(db, project, concept).then(() => undefined, toFailure),
    ),

    // The member who adds a Part is its owner, when the Part names no other.
    addPart: withMember((db, { project, part }: PartAddInput, member) =>
      toOperations(db)
        .addPart(project, part, member.email)
        .then(toSavedPart, toFailure),
    ),

    updatePart: withMember(
      (db, { project, recordId, change, expected }: PartUpdateInput) =>
        toOperations(db)
          .updatePart(project, recordId, change, expected)
          .then(toSavedPart, toFailure),
    ),

    // An answer in words carries the name of the member. Only the owner
    // answers a flag.
    answerPart: withMember(
      (db, { project, recordId, answer }: AnswerInput, member) =>
        toOperations(db)
          .answerPart(
            project,
            recordId,
            { ...answer, by: member.name },
            member.email,
          )
          .then(toSavedPart, toFailure),
    ),

    // The answer to a question carries the name of the person of the session.
    answerQuestion: withMember(
      (db, { project, recordId, answer }: QuestionAnswerInput, member) =>
        toOperations(db)
          .answerQuestion(project, recordId, { ...answer, by: member.name })
          .then(toSavedPart, toFailure),
    ),

    listMine: withReader((db, { project }: ProjectInput, member) =>
      listMine(db, project, member?.email),
    ),

    // The watched group of Mine. A person who is no member watches nothing.
    listWatched: withReader((db, { project }: ProjectInput, member) =>
      member ? listWatched(db, project, member.email) : Promise.resolve([]),
    ),

    listMeasured: withReader((db, { project }: ProjectInput) =>
      listMeasured(db, project),
    ),

    // The person who adds a Project is its first member.
    addProject: withUser(
      async (
        db,
        { slug, name }: ProjectAddInput,
        user,
      ): Promise<{ slug: string } | Failure> => {
        if (await findProject(db, slug))
          return { message: `project "${slug}" exists already` }
        await addProject(db, slug, name)
        await joinProject(db, slug, user)
        return { slug }
      },
    ),

    listSignals: withSession((db, { project }: ProjectInput) =>
      listSignals(db, getGithub(), project),
    ),

    listBuilds: withSession((db, { project, named }: BuildsInput) =>
      listBuilds(db, getGithub(), project, named),
    ),

    addSignalInsight: withMember(
      (db, { project, insight }: SignalInsightAddInput) =>
        toOperations(db)
          .addSignalInsight(project, insight)
          .then(toSavedPart, toFailure),
    ),

    addJoint: withMember((db, { project, joint }: JointAddInput) =>
      addJoint(db, project, joint).then((id) => ({ id }), toFailure),
    ),

    removeJoint: withMember((db, { project, jointId }: JointRemoveInput) =>
      removeJoint(db, project, jointId).then(() => undefined, toFailure),
    ),

    findPeople: withReader(
      async (db, { project }: ProjectInput, member): Promise<People> => {
        const [members, assignments, watchers] = await Promise.all([
          listMembers(db, project),
          listAssignments(db, project),
          listWatchers(db, project),
        ])
        return { members, assignments, watchers, me: member?.id ?? null }
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

    // The member of the session watches the Part, and stops.
    watch: withMember((db, { project, recordId }: PartReadInput, member) =>
      watch(db, project, { member: member.email, part: recordId }).then(
        () => undefined,
        toFailure,
      ),
    ),

    unwatch: withMember((db, { project, recordId }: PartReadInput, member) =>
      unwatch(db, project, { member: member.email, part: recordId }).then(
        () => undefined,
        toFailure,
      ),
    ),
  }
}
