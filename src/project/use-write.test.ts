import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The check of glue-build/D55 in `pnpm lint`: a screen that takes `useWrite`
// takes `pending` and `failure` by name. `pnpm typecheck` then fails on the
// one that the screen does not use (`noUnusedLocals`).
const MESSAGE =
  'Take `pending` and `failure` from useWrite() by name: a write shows that it runs and why it failed (glue-build/D55).'

// The count of the faults that the rule finds in the code of a screen. The
// lint has the rule alone, as the config of the repo gives it to a screen:
// it reads no types, so it is fast.
async function countFaults(code: string): Promise<number> {
  const { rules } = await new ESLint().calculateConfigForFile(
    'src/project/use-write.ts',
  )
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      rules: { 'no-restricted-syntax': rules['no-restricted-syntax'] },
    },
  })
  const [{ messages }] = await eslint.lintText(code)
  return messages.filter(({ message }) => message === MESSAGE).length
}

// The messages of the import rule for the code of a file, as the config of
// the repo gives the rule to that file.
async function findImportFaults(file: string, code: string) {
  const { rules } = await new ESLint().calculateConfigForFile(file)
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      rules: { 'no-restricted-imports': rules['no-restricted-imports'] },
    },
  })
  const [{ messages }] = await eslint.lintText(code)
  return messages.map(({ ruleId }) => ruleId)
}

// A screen cannot go around `useWrite`: it cannot start a write itself and
// it cannot call a server function (glue-build/D55).
describe('the lint rule for the imports of a write', () => {
  it.each([
    ['starts a write itself', "import { startWrite } from './use-write.ts'"],
    [
      'starts a write itself, from another folder',
      "import { startWrite, useWrite } from '../project/use-write.ts'",
    ],
    [
      'calls a server function',
      "import { updatePartFn } from '../db/parts.functions.ts'",
    ],
  ])('finds a screen that %s', async (_name, code) => {
    expect(
      await findImportFaults('src/project/record-screen.tsx', code),
    ).toEqual(['no-restricted-imports'])
  })

  it('passes a screen that takes useWrite', async () => {
    expect(
      await findImportFaults(
        'src/project/record-screen.tsx',
        "import { toWrite, useWrite } from './use-write.ts'",
      ),
    ).toEqual([])
  })

  it.each([
    [
      'src/router-server.ts',
      "import { updatePartFn } from './db/parts.functions.ts'",
    ],
    [
      'src/router.test.ts',
      "import { startWrite } from './project/use-write.ts'",
    ],
  ])('passes %s, a part of the router context', async (file, code) => {
    expect(await findImportFaults(file, code)).toEqual([])
  })
})

describe('the lint rule for useWrite', () => {
  it.each([
    ['no loading state', 'const { failure, write } = useWrite()'],
    ['no failure', 'const { pending, write } = useWrite()'],
    ['a write alone', 'const { write } = useWrite()'],
    ['one value for all three', 'const saved = useWrite()'],
    ['no value at all', "void useWrite().write('Saving', run)"],
  ])('finds a screen with %s', async (_name, code) => {
    expect(await countFaults(code)).toBe(1)
  })

  it.each([
    ['both', 'const { pending, failure, write } = useWrite()'],
    [
      'both under other names',
      'const { pending: jointPending, failure: jointFailure, write: writeJoint } = useWrite()',
    ],
    [
      'both and its own words',
      'const { pending, failure, write } = useWrite(unavailable)',
    ],
  ])('passes a screen that takes %s', async (_name, code) => {
    expect(await countFaults(code)).toBe(0)
  })
})
