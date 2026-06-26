import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CommitMessageWebview } from '@webview/commit-message/commit-message-webview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><CommitMessageWebview /></StrictMode>); }
