import type { StorybookConfig } from '@storybook/react-vite';

const config = {
    stories: ['../src/webview/**/*.stories.@(ts|tsx)'],
    addons: [],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    typescript: {
        reactDocgen: false,
    },
} satisfies StorybookConfig;

export default config;
