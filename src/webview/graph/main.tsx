import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GraphApp } from './GraphApp';
import '../styles.css';

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><GraphApp /></StrictMode>); }
