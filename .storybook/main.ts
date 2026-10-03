import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/design-system/**/*.@(mdx|stories.tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    // The app's Vite config holds the TanStack Start plugin, which breaks Storybook.
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  core: { disableTelemetry: true },
  // Carbon's own stories, composed and not copied.
  refs: {
    carbon: {
      title: 'Carbon',
      url: 'https://react.carbondesignsystem.com',
    },
  },
}

export default config
