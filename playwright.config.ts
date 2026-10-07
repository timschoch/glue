import { defineConfig } from '@playwright/test'

export default defineConfig({
  projects: [
    { name: 'user-sim', testDir: 'mocks/user-sim/e2e' },
    { name: 'app', testDir: 'e2e' },
  ],
})
