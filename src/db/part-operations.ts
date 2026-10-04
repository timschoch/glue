import type { GithubClient } from '../github/client.ts'
import { createDownstreamIssue } from '../github/downstream-issue.ts'
import type { DownstreamIssue } from '../github/downstream-issue.ts'
import type { ConceptDb } from './client.ts'
import {
  addPart,
  answerPart,
  answerQuestion,
  updatePart,
} from './part-records.ts'
import type {
  ExpectedPart,
  NewPart,
  PartAnswer,
  PartChange,
  QuestionAnswer,
} from './part-records.ts'
import { findPart } from './parts.ts'
import type { Part } from './parts.ts'
import { InvalidRecordError, PartNotFoundError } from './record-errors.ts'
import { addSignalInsight } from './signals.ts'
import type { SignalInsight } from './signals.ts'

// A Part after a write, with what became of its downstream issue. When
// GitHub failed, the Part is saved and the issue is `failed`.
export type ChangedPart = { part: Part; issue: DownstreamIssue }

// What a person or an agent does with a Part. The server functions, the
// HTTP API and the CLI call these operations. One operation is the whole
// write: the write with its Trust spread, the downstream issue of an
// accepted Decision, and the read of the Part as it is now. A Part that
// does not exist is a PartNotFoundError.
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

  async function toChangedPart(
    project: string,
    recordId: string,
  ): Promise<ChangedPart> {
    const issue = await createDownstreamIssue(db, github, project, recordId)
    return { part: await getPart(project, recordId), issue }
  }

  return {
    getPart,

    async addPart(project: string, part: NewPart) {
      return toChangedPart(project, await addPart(db, project, part))
    },

    // `expected` holds the values that the person saw. The Part with other
    // values now is an InvalidRecordError, and nothing changes.
    async updatePart(
      project: string,
      recordId: string,
      change: PartChange,
      expected?: ExpectedPart,
    ) {
      const changed = await updatePart(db, project, recordId, change, expected)
      if (!changed)
        throw new InvalidRecordError(
          `"${recordId}" changed since you opened it`,
        )
      return toChangedPart(project, recordId)
    },

    async answerPart(project: string, recordId: string, answer: PartAnswer) {
      await answerPart(db, project, recordId, answer)
      return toChangedPart(project, recordId)
    },

    async answerQuestion(
      project: string,
      recordId: string,
      answer: QuestionAnswer,
    ) {
      await answerQuestion(db, project, recordId, answer)
      return toChangedPart(project, recordId)
    },

    async addSignalInsight(project: string, insight: SignalInsight) {
      return toChangedPart(
        project,
        await addSignalInsight(db, github, project, insight),
      )
    },
  }
}
