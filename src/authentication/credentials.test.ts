import { describe, expect, it } from 'vitest'

import {
  findProblem,
  parseSignIn,
  parseSignUp,
  validateSignIn,
  validateSignUp,
} from './credentials.ts'

describe('validateSignIn', () => {
  it('finds no problem in an email and a password', () => {
    expect(
      validateSignIn({ email: 'ada@example.com', password: 'correct horse' }),
    ).toStrictEqual({ email: undefined, password: undefined })
  })

  it('names each field with a problem, and says how to fix it', () => {
    expect(validateSignIn({ email: 'ada', password: '' })).toEqual({
      email: 'Enter an email address, such as ada@example.com.',
      password: 'Enter a password.',
    })
  })

  it('accepts a short password, so an old account can sign in', () => {
    expect(
      validateSignIn({ email: 'ada@example.com', password: 'short' }).password,
    ).toBeUndefined()
  })

  it.each([
    ['email', { email: `${'a'.repeat(250)}@b.co`, password: 'correct horse' }],
    ['password', { email: 'ada@example.com', password: 'a'.repeat(129) }],
  ] as const)(
    'finds a problem in an %s that is too long',
    (field, credentials) => {
      expect(findProblem(validateSignIn(credentials))?.[0]).toBe(field)
    },
  )
})

describe('validateSignUp', () => {
  const account = {
    name: 'Ada',
    email: 'ada@example.com',
    password: 'correct horse',
  }

  it('finds no problem in a name, an email and a password', () => {
    expect(findProblem(validateSignUp(account))).toBeUndefined()
  })

  it('names each field with a problem, in the order of the form', () => {
    const problems = validateSignUp({
      name: ' ',
      email: '',
      password: 'short12',
    })

    expect(problems).toEqual({
      name: 'Enter a name.',
      email: 'Enter an email address, such as ada@example.com.',
      password: 'The password must have 8 characters or more.',
    })
    expect(findProblem(problems)).toEqual(['name', 'Enter a name.'])
  })

  it('finds a problem in a name longer than 100 characters', () => {
    expect(
      findProblem(validateSignUp({ ...account, name: 'a'.repeat(101) })),
    ).toEqual(['name', 'The name must have 100 characters or fewer.'])
  })
})

describe('parseSignIn', () => {
  it('returns the email in lower case without spaces around it, and the password as it is', () => {
    expect(
      parseSignIn({ email: '  Ada@Example.com ', password: ' pass word ' }),
    ).toEqual({ email: 'ada@example.com', password: ' pass word ' })
  })

  it('returns only the email and the password', () => {
    expect(
      parseSignIn({
        email: 'ada@example.com',
        password: 'correct horse',
        callbackURL: 'https://evil.example',
      }),
    ).toEqual({ email: 'ada@example.com', password: 'correct horse' })
  })

  it.each([
    ['no object', 'ada@example.com'],
    ['nothing', null],
    ['no email', { password: 'correct horse' }],
    ['an email without @', { email: 'ada', password: 'correct horse' }],
    ['no password', { email: 'ada@example.com' }],
    ['an empty password', { email: 'ada@example.com', password: '' }],
    ['a password that is not text', { email: 'ada@example.com', password: 1 }],
    [
      'a password longer than 128 characters',
      { email: 'ada@example.com', password: 'a'.repeat(129) },
    ],
    [
      'an email longer than 254 characters',
      { email: `${'a'.repeat(250)}@b.co`, password: 'correct horse' },
    ],
  ])('rejects %s', (_case, input) => {
    expect(() => parseSignIn(input)).toThrow()
  })
})

describe('parseSignUp', () => {
  it('returns the name without spaces around it, with the credentials', () => {
    expect(
      parseSignUp({
        name: ' Ada ',
        email: 'Ada@example.com',
        password: 'correct horse',
      }),
    ).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct horse',
    })
  })

  it('rejects a password shorter than 8 characters', () => {
    expect(() =>
      parseSignUp({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'short12',
      }),
    ).toThrow('The password must have 8 characters or more.')
  })

  it('rejects an empty name', () => {
    expect(() =>
      parseSignUp({
        name: '  ',
        email: 'ada@example.com',
        password: 'correct horse',
      }),
    ).toThrow('Enter a name.')
  })
})
