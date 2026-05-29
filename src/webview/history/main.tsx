// Placeholder — implemented in the Commit History feature slice.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export function CommitHistoryApp() {
    return <div>Commit History - loading...</div>;
}

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><CommitHistoryApp /></StrictMode>); }
