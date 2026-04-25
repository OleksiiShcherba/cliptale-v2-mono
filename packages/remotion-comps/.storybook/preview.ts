import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0D0D14' },
        { name: 'surface-alt', value: '#16161F' },
      ],
    },
  },
};

export default preview;
