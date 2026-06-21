import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FileHistoryWebview } from '@webview/file-history/FileHistoryWebview';
import '@webview/styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><FileHistoryWebview /></StrictMode>); }
