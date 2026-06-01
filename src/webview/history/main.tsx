import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HistoryWebview } from './HistoryWebview';
import '../styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><HistoryWebview /></StrictMode>); }
