import type { GithubClient } from '../github/client.ts'
import { createDownstreamIssue } from '../github/downstream-issue.ts'
import type { DownstreamIssue } from '../github/downstream-issue.ts'
import { createSignalSources } from '../signals/signal-sources.server.ts'
import type { ConceptDb } from './client.ts'
import { movePartsToProject } from './part-move.ts'
import type { MoveTarget } from './part-move.ts'
import {
  addPart,
  answerPart,
  answerQuestion,
  supersedeDecision,
  updatePart,
} from './part-records.ts'
import type {
  ExpectedPart,
  NewPart,
  PartAnswer,
  PartChange,
  QuestionAnswer,
} from './part-records.ts'
import { findPart, listPartsByRecordId } from './parts.ts'
import type { Part, PartSummary } from './parts.ts'
import { InvalidRecordError, PartNotFoundError } from './record-errors.ts'
import { typeOfRecordId } from './record-id.ts'
import { addSignalInsight, listSignals } from './signals.ts'
import type { SignalInsight } from './signals.ts'

// A Part after a write, with what became of its downstream issue. When
// GitHub failed, the Part is saved and the issue is `failed`.
export type ChangedPart = { part: Part; issue: DownstreamIssue }

// The status that a Decision gets. `superseded` goes with the accepted
// Decision that replaces it.
export type DecisionStatusChange =
  | { status: 'proposed' | 'accepted'; supersededBy?: undefined }
  | { status: 'superseded'; supersededBy: string }

// What a person or an agent does with a Part. The server functions, the
// HTTP API and the CLI call these operations. One operation is the whole
// write: the write with its Trust spread, the downstream issue of a
// Decision that the write made accepted, and the read of the Part as it is
// now. A Part that does not exist is a PartNotFoundError.
export function createPartOperations({
  db,
  github,
}: {
  db: ConceptDb
  github: GithubClient
}) {
  async function getPart(project: string, recordId: string): Promise<Part> {
    const part = await findPart(db, project, recordId)
    if (!part) throw new PartNotFoundError(recordId)
    return part
  }

  // Before a write: is the Part an accepted Decision already? Then the
  // write opens no issue (D53).
  async function isAccepted(project: string, recordId: string) {
    if (typeOfRecordId(recordId) !== 'decision') return false
    const found = await listPartsByRecordId(db, project, [recordId])
    return found.at(0)?.status === 'accepted'
  }

  // The issue opens when the write made the Decision accepted.
  async function toChangedPart(
    project: string,
    recordId: string,
    wasAccepted = false,
  ): Promise<ChangedPart> {
    const issue = await createDownstreamIssue(
      db,
      github,
      project,
      recordId,
      wasAccepted,
    )
    return { part: await getPart(project, recordId), issue }
  }

  // The Parts of a move, in the order of the ids. One statement reads them:
  // a read of each Part at the same time is more requests than Neon takes.
  async function listMoved(
    project: string,
    recordIds: string[],
  ): Promise<PartSummary[]> {
    const found = await listPartsByRecordId(db, project, recordIds)
    return recordIds.map((recordId) => {
      const part = found.find(({ id }) => id === recordId)
      if (!part) throw new PartNotFoundError(recordId)
      return part
    })
  }

  return {
    getPart,

    // `addedBy` is the e-mail address of the member who adds the Part: its
    // owner, when the Part names no other.
    async addPart(project: string, part: NewPart, addedBy?: string) {
      return toChangedPart(project, await addPart(db, project, part, addedBy))
    },

    // `expected` holds the values that the person saw. The Part with other
    // values now is an InvalidRecordError, and nothing changes. `changedBy`
    // is the e-mail address of the member who changes the Part.
    async updatePart(
      project: string,
      recordId: string,
      change: PartChange,
      expected?: ExpectedPart,
      changedBy?: string,
    ) {
      const wasAccepted = await isAccepted(project, recordId)
      const changed = await updatePart(
        db,
        project,
        recordId,
        change,
        expected,
        changedBy,
      )
      if (!changed)
        throw new InvalidRecordError(
          `"${recordId}" changed since you opened it`,
        )
      return toChangedPart(project, recordId, wasAccepted)
    },

    // Moves the Parts to the Concept of their Project, and gives them back
    // as they are now. One of them does not exist: no Part moves.
    async moveParts(project: string, recordIds: string[], concept: string) {
      await listMoved(project, recordIds)
      for (const recordId of recordIds)
        await updatePart(db, project, recordId, { concept })
      return listMoved(project, recordIds)
    },

    // Moves the Parts to a Concept of another Project: see
    // movePartsToProject. Gives them back as they are now, with the Joints
    // that the move removed.
    async movePartsToProject(
      project: string,
      recordIds: string[],
      target: MoveTarget,
    ) {
      const droppedJoints = await movePartsToProject(
        db,
        project,
        recordIds,
        target,
      )
      const parts = await listMoved(target.project, recordIds)
      return { parts, droppedJoints }
    },

    // Gives a Decision that exists its status: see supersedeDecision for
    // `superseded`. No other status takes a successor.
    async setDecisionStatus(
      project: string,
      recordId: string,
      change: DecisionStatusChange,
    ) {
      if (
        (change.status === 'superseded') !==
        (change.supersededBy !== undefined)
      )
        throw new InvalidRecordError(
          'the status "superseded" and "supersededBy" go together',
        )
      const wasAccepted = await isAccepted(project, recordId)
      if (change.status === 'superseded')
        await supersedeDecision(db, project, recordId, change.supersededBy)
      else await updatePart(db, project, recordId, { status: change.status })
      return toChangedPart(project, recordId, wasAccepted)
    },

    // `answeredBy` is the e-mail address of the member who answers. Only
    // the owner answers a flag.
    async answerPart(
      project: string,
      recordId: string,
      answer: PartAnswer,
      answeredBy?: string,
    ) {
      const wasAccepted = await isAccepted(project, recordId)
      // The Signals come live from their tools: a raise reads them.
      const listLevelSignals = async () => {
        const sources = createSignalSources(github, db, project)
        const { signals } = await listSignals(db, sources, project)
        return signals.filter(({ insight }) => insight?.id === recordId)
      }
      await answerPart(
        db,
        project,
        recordId,
        answer,
        answeredBy,
        listLevelSignals,
      )
      return toChangedPart(project, recordId, wasAccepted)
    },

    async answerQuestion(
      project: string,
      recordId: string,
      answer: QuestionAnswer,
      answeredBy?: string,
    ) {
      const wasAccepted = await isAccepted(project, recordId)
      await answerQuestion(db, project, recordId, answer, answeredBy)
      return toChangedPart(project, recordId, wasAccepted)
    },

    async addSignalInsight(project: string, insight: SignalInsight) {
      return toChangedPart(
        project,
        await addSignalInsight(
          db,
          createSignalSources(github, db, project),
          project,
          insight,
        ),
      )
    },
  }
}
