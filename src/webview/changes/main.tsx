import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChangesApp } from '../features/changes/ChangesApp';
import '../styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><ChangesApp /></StrictMode>); }
