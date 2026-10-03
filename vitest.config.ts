import { defineConfig } from 'vitest/config'

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
  },
})
