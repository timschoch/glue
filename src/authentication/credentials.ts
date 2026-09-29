export type SignIn = { email: string; password: string }

export type SignUp = SignIn & { name: string }

// For each field its problem with the way to fix it, or nothing.
export type Problems<TField extends string> = Record<TField, string | undefined>

// The limits of Better Auth, and the longest email address that can get mail.
const passwordMinimum = 8
const passwordMaximum = 128
const emailMaximum = 254
const nameMaximum = 100

function validateEmail(email: string): string | undefined {
  const trimmed = email.trim()
  return trimmed.includes('@') && trimmed.length <= emailMaximum
    ? undefined
    : 'Enter an email address, such as ada@example.com.'
}

function validatePassword(password: string, minimum: number) {
  if (password.length === 0) return 'Enter a password.'
  if (password.length < minimum) {
    return `The password must have ${minimum} characters or more.`
  }
  if (password.length > passwordMaximum) {
    return `The password must have ${passwordMaximum} characters or fewer.`
  }
  return undefined
}

function validateName(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter a name.'
  if (trimmed.length > nameMaximum) {
    return `The name must have ${nameMaximum} characters or fewer.`
  }
  return undefined
}

// The fields are in the order of the form.
export function validateSignIn(credentials: SignIn): Problems<keyof SignIn> {
  return {
    email: validateEmail(credentials.email),
    // An old account can have a short password: no minimum at sign-in.
    password: validatePassword(credentials.password, 1),
  }
}

export function validateSignUp(account: SignUp): Problems<keyof SignUp> {
  return {
    name: validateName(account.name),
    email: validateEmail(account.email),
    password: validatePassword(account.password, passwordMinimum),
  }
}

// The first field with a problem.
export function findProblem<TField extends string>(
  problems: Partial<Problems<TField>>,
): [field: TField, problem: string] | undefined {
  for (const field in problems) {
    const problem = problems[field]
    if (problem !== undefined) return [field, problem]
  }
  return undefined
}

function readText(input: unknown, key: string): string {
  const value =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)[key]
      : undefined
  return typeof value === 'string' ? value : ''
}

function rejectProblems(problems: Problems<string>): void {
  const found = findProblem(problems)
  if (found) throw new Error(found[1])
}

export function parseSignIn(input: unknown): SignIn {
  const credentials = {
    email: readText(input, 'email').trim().toLowerCase(),
    password: readText(input, 'password'),
  }
  rejectProblems(validateSignIn(credentials))
  return credentials
}

export function parseSignUp(input: unknown): SignUp {
  const account = {
    name: readText(input, 'name').trim(),
    email: readText(input, 'email').trim().toLowerCase(),
    password: readText(input, 'password'),
  }
  rejectProblems(validateSignUp(account))
  return account
}
