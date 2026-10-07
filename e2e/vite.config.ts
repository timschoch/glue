import path from 'node:path'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const here = import.meta.dirname

// The app with the memory server of its tests in place of the server
// functions. No database.
export default defineConfig({
  root: path.join(here, '..'),
  resolve: {
    tsconfigPaths: true,
    alias: { vitest: path.join(here, 'vitest-stub.ts') },
  },
  // Carbon's own Sass warns about syntax it will change itself.
  css: { preprocessorOptions: { scss: { quietDeps: true } } },
  plugins: [
    {
      name: 'memory-server',
      enforce: 'pre',
      resolveId: (source, importer) =>
        source === './router-server.ts' && importer?.endsWith('/src/router.tsx')
          ? path.join(here, 'memory-server.ts')
          : undefined,
    },
    nitro(),
    tanstackStart(),
    viteReact(),
  ],
})
