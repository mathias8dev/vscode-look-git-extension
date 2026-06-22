import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualRebaseWebview } from '@webview/visual-rebase/visual-rebase-webview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><VisualRebaseWebview /></StrictMode>); }
