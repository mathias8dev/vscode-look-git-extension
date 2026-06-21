import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GraphWebview } from '@webview/graph/GraphWebview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><GraphWebview /></StrictMode>); }
