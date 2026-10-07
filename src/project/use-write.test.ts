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
