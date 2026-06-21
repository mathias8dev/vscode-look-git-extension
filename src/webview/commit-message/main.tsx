import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CommitMessageWebview } from '@webview/commit-message/CommitMessageWebview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><CommitMessageWebview /></StrictMode>); }
