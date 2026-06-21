import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HistoryWebview } from '@webview/history/history-webview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><HistoryWebview /></StrictMode>); }
