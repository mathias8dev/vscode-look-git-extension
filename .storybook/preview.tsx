import type { Preview } from '@storybook/react-vite';
import '../src/webview/styles.css';
import '../src/webview/storybook.css';

const preview = {
    decorators: [
        (Story) => (
            <div className="storybook-vscode-shell">
                <Story />
            </div>
        ),
    ],
    parameters: {
        backgrounds: {
            default: 'VS Code Dark',
            values: [
                { name: 'VS Code Dark', value: '#1e1e1e' },
                { name: 'VS Code Light', value: '#ffffff' },
            ],
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'fullscreen',
    },
} satisfies Preview;

export default preview;
