import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChangesWebview } from '@webview/changes/ChangesWebview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><ChangesWebview /></StrictMode>); }
