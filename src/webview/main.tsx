// Placeholder shell — replaced by changes/main.tsx and graph/main.tsx in later phases
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@webview/app';
import '@webview/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) { throw new Error('Missing React root element.'); }

createRoot(rootElement).render(<StrictMode><App /></StrictMode>);
