import type { Preview } from '@storybook/react-vite';
import { WebviewTooltipProvider } from '../src/webview/shared/webview-tooltip-provider';
import '../src/webview/styles.css';
import '../src/webview/storybook.css';

const preview = {
    decorators: [
        (Story) => (
            <WebviewTooltipProvider>
                <div className="storybook-vscode-shell">
                    <Story />
                </div>
            </WebviewTooltipProvider>
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
