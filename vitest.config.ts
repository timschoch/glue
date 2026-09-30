import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'mocks/*/src/**/*.test.ts',
    ],
    // PGlite starts and migrates per file, which takes over 10 s when several Workers share the machine.
    hookTimeout: 60_000,
  },
})
