import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // Carbon's own Sass warns about syntax it will change itself.
  css: { preprocessorOptions: { scss: { quietDeps: true } } },
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'mocks/*/src/**/*.test.ts',
    ],
    // The Frame test reads computed styles, so the design system's Sass must load.
    css: { include: [/src\/design-system\//] },
    // PGlite starts and migrates per file, which takes over 10 s when several Workers share the machine.
    hookTimeout: 60_000,
    // No test imports a migration or the lockfile, so `--changed` does not see them. A diff that touches one runs all tests.
    // The paths start at the root: `**` does not match a dot folder, and a worktree lives in one (`~/.t3/`).
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      ...[
        'drizzle/**',
        'pnpm-lock.yaml',
        'package.json',
        'vitest.config.ts',
      ].map((path) => `${import.meta.dirname}/${path}`),
    ],
  },
})
