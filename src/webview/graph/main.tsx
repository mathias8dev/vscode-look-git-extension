// Placeholder — implemented in Phase 5b
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorNotice } from '../shared/ErrorNotice';
import { useProtocolError } from '../shared/useProtocolError';
import '../styles.css';

export function GraphApp() {
    const error = useProtocolError();
    return (
        <main className="app-shell">
            <section className="hero">
                <p className="eyebrow">Git Graph</p>
                <h1>Loading...</h1>
                <ErrorNotice error={error} />
            </section>
        </main>
    );
}

const root = document.getElementById('root');
if (root) { createRoot(root).render(<StrictMode><GraphApp /></StrictMode>); }
