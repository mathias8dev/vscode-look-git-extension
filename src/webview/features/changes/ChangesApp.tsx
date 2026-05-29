import { useEffect, useMemo, useReducer } from 'react';
import type { ChangesExtensionToWebviewMessage } from '../../../protocol/changes/messages';
import { vscodeApi } from '../../platform/vscodeHost';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { ChangeSectionView } from './ChangeSectionView';
import { EmptyState } from './EmptyState';
import { buildChangeSections } from './changeTree';
import { createInitialChangesState, getChangeCount, reduceChangesState, type ChangesViewMode } from './changesState';

export function ChangesApp() {
    const [state, dispatch] = useReducer(reduceChangesState, undefined, createInitialChangesState);
    const sections = useMemo(() => buildChangeSections(state.status), [state.status]);
    const changeCount = getChangeCount(state.status);

    useEffect(() => {
        const onMessage = (event: MessageEvent<ChangesExtensionToWebviewMessage>) => {
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        vscodeApi.postMessage({ type: 'changes/ready' });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const setViewMode = (viewMode: ChangesViewMode) => {
        dispatch({ type: 'setViewMode', viewMode });
        vscodeApi.postMessage({ type: 'changes/viewModeChanged', asTree: viewMode === 'tree' });
    };

    return (
        <main className="changes-shell">
            <header className="changes-header">
                <div>
                    <h1>Changes</h1>
                    <p>{state.loading ? 'Loading repository state' : summaryText(changeCount)}</p>
                </div>
                <div className="segmented" role="group" aria-label="Changes view mode">
                    <button type="button" aria-pressed={state.viewMode === 'tree'} onClick={() => setViewMode('tree')}>Tree</button>
                    <button type="button" aria-pressed={state.viewMode === 'list'} onClick={() => setViewMode('list')}>List</button>
                </div>
            </header>

            {state.status.conflictState !== 'none' ? (
                <section className="changes-banner" aria-label="Operation in progress">
                    <strong>{operationLabel(state.status.conflictState)} in progress</strong>
                </section>
            ) : null}

            <ErrorNotice error={state.error} />

            <section className="changes-content" aria-label="Repository changes">
                {state.loading ? <EmptyState title="Loading changes" /> : null}
                {!state.loading && changeCount === 0 ? <EmptyState title="No changes" /> : null}
                {!state.loading && changeCount > 0 ? sections.map((section) => (
                    <ChangeSectionView key={section.id} section={section} viewMode={state.viewMode} />
                )) : null}
            </section>
        </main>
    );
}

function summaryText(count: number): string {
    return count === 1 ? '1 changed file' : `${count} changed files`;
}

function operationLabel(state: 'merge' | 'rebase'): string {
    return state === 'merge' ? 'Merge' : 'Rebase';
}
