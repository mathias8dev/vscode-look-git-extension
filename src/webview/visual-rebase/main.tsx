import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualRebaseWebview } from './VisualRebaseWebview';
import '../styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><VisualRebaseWebview /></StrictMode>); }
