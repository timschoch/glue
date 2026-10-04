import { redirect } from '@tanstack/react-router'

import type { Failure, Session } from '../authentication/session.ts'
import type { GithubClient } from '../github/client.ts'
import type { ConceptDb } from './client.ts'
import { findMember } from './members.ts'
import type { Member } from './members.ts'
import { InvalidRecordError } from './record-errors.ts'

// What the actions of the server functions take from the request.
export type ActionRequest = {
  findSession: () => Promise<Session | undefined>
  getDb: () => ConceptDb
  getGithub: () => GithubClient
}

// A record that breaks a rule is an answer for the person, not an error
// of the server.
export async function toFailure(error: unknown): Promise<Failure> {
  if (error instanceof InvalidRecordError) return { message: error.message }
  throw error
}

// A route guard does not protect a server function, thus each action looks
// for the session first.
export function createSessionGuard({
  findSession,
  getDb,
}: Pick<ActionRequest, 'findSession' | 'getDb'>) {
  async function getUser() {
    const session = await findSession()
    if (!session) throw redirect({ to: '/sign-in' })
    return session.user
  }

  function withSession<TInput extends unknown[], TResult>(
    run: (db: ConceptDb, ...input: TInput) => Promise<TResult>,
  ) {
    return async (...input: TInput) => {
      await getUser()
      return run(getDb(), ...input)
    }
  }

  // A read that depends on who reads: `member` is the member of the person
  // in the Project, or undefined for a person who is no member.
  function withReader<TInput extends { project: string }, TResult>(
    run: (
      db: ConceptDb,
      input: TInput,
      member: Member | undefined,
    ) => Promise<TResult>,
  ) {
    return async (input: TInput) => {
      const user = await getUser()
      const db = getDb()
      return run(db, input, await findMember(db, input.project, user.id))
    }
  }

  // Only a member writes to a Project in the app (D31). A person who is no
  // member reads only.
  function withMember<TInput extends { project: string }, TResult>(
    run: (db: ConceptDb, input: TInput, member: Member) => Promise<TResult>,
  ) {
    return withReader<TInput, TResult | Failure>((db, input, member) =>
      member
        ? run(db, input, member)
        : Promise.resolve({
            message: 'Only a member of the Project can change it.',
          }),
    )
  }

  // The action takes the account of the person.
  function withUser<TInput, TResult>(
    run: (
      db: ConceptDb,
      input: TInput,
      user: Session['user'],
    ) => Promise<TResult>,
  ) {
    return async (input: TInput) => run(getDb(), input, await getUser())
  }

  return { withSession, withReader, withMember, withUser }
}
