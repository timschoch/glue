import type { SignIn, SignUp } from './authentication/credentials.ts'
import type { Failure, Session } from './authentication/session.ts'
import type { Concept, LinkedRecord } from './db/concept.ts'

// What the routes need from the server. A test gives the router its own.
export type RouterContext = {
  fetchSession: () => Promise<Session | undefined>
  fetchConcept: () => Promise<Concept | undefined>
  fetchRecord: (recordId: string) => Promise<LinkedRecord | undefined>
  signIn: (credentials: SignIn) => Promise<Failure | undefined>
  signUp: (account: SignUp) => Promise<Failure | undefined>
  signOut: () => Promise<void>
}
