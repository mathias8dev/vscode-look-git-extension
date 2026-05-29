// Placeholder — implemented in Phase 4b
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export function ChangesApp() {
    return <div>Changes - loading...</div>;
}

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><ChangesApp /></StrictMode>); }
