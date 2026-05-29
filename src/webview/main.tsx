import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ExtensionToWebviewMessage } from '../protocol/messages';
import { App } from './App';
import { createWebviewHost } from './platform/vscodeHost';
import './styles.css';

function Root() {
    const [message, setMessage] = useState<ExtensionToWebviewMessage | null>(null);

    useEffect(() => {
        const host = createWebviewHost();
        const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
            setMessage(event.data);
        };

        window.addEventListener('message', handleMessage);
        host.postMessage({ type: 'ready' });

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    return <App message={message} />;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Missing React root element.');
}

createRoot(rootElement).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
