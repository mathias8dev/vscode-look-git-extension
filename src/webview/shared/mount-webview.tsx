import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebviewTooltipProvider } from '@webview/shared/webview-tooltip-provider';

export function mountWebview(webview: ReactNode): void {
    const root = document.getElementById('root');
    if (!root) { return; }
    createRoot(root).render(
        <StrictMode>
            <WebviewTooltipProvider>{webview}</WebviewTooltipProvider>
        </StrictMode>,
    );
}
