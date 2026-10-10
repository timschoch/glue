//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
      // A screen takes `pending` and `failure` from each useWrite() by name.
      // TypeScript then fails on the one that the screen does not use
      // (glue-build/D55). Its test: src/project/use-write.test.ts.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':not(VariableDeclarator[id.type="ObjectPattern"]:has(Property[key.name="pending"]):has(Property[key.name="failure"])) > CallExpression[callee.name="useWrite"]',
          message:
            'Take `pending` and `failure` from useWrite() by name: a write shows that it runs and why it failed (glue-build/D55).',
        },
      ],
      // A screen cannot go around useWrite(): it starts no write itself
      // and calls no server function. An import with no file ending and a
      // re-export count too. The same test.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: 'use-write(\\.[jt]sx?)?$',
              importNames: ['startWrite'],
              message:
                'Take useWrite(): it starts the write and shows that it runs and why it failed (glue-build/D55).',
            },
            {
              regex: '\\.functions(\\.[jt]sx?)?$',
              message:
                'Take the write from the router context and give it to useWrite() (glue-build/D55).',
            },
          ],
        },
      ],
    },
  },
  {
    // The router context makes each write from its server function, and its
    // test starts a write.
    files: ['src/router-server.ts', 'src/router.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.temp/**',
      '.agents/**',
      '.claude/**',
      '.output/**',
      'storybook-static/**',
    ],
  },
]
