import type { Preview } from '@storybook/react-vite'

import '../src/design-system/theme.scss'

const preview: Preview = {
  parameters: {
    options: { storySort: { order: ['Foundations', 'Frame'] } },
  },
}

export default preview
