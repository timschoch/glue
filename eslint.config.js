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
    },
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
