import { redirect } from '@tanstack/react-router'

import type { Failure, Session } from '../authentication/session.ts'
import type { GithubClient } from '../github/client.ts'
import type { ConceptDb } from './client.ts'
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
  return function withSession<TInput extends unknown[], TResult>(
    run: (db: ConceptDb, ...input: TInput) => Promise<TResult>,
  ) {
    return async (...input: TInput) => {
      if (!(await findSession())) throw redirect({ to: '/sign-in' })
      return run(getDb(), ...input)
    }
  }
}
