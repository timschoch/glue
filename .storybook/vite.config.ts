import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Carbon's own Sass warns about syntax it will change itself.
  css: { preprocessorOptions: { scss: { quietDeps: true } } },
  plugins: [viteReact()],
})
