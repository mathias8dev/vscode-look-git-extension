import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CommitMessageWebview } from './CommitMessageWebview';
import '../styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><CommitMessageWebview /></StrictMode>); }
