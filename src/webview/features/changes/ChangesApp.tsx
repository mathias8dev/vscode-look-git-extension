import { useEffect, useMemo, useReducer, type CSSProperties } from 'react';
import type { ChangesExtensionToWebviewMessage } from '../../../protocol/changes/messages';
import type { StatusEntry } from '../../../protocol/changes/types';
import { vscodeApi } from '../../platform/vscodeHost';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { buildChangeSections, buildChangeTree, statusLabel, type ChangeListItem, type ChangeSection } from './changeTree';
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

function ChangeSectionView({ section, viewMode }: { readonly section: ChangeSection; readonly viewMode: ChangesViewMode }) {
    if (section.items.length === 0) { return null; }
    const tree = buildChangeTree(section.items);
    return (
        <section className="change-section" aria-labelledby={`${section.id}-title`}>
            <header className="change-section-header">
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                <span>{section.items.length}</span>
            </header>
            <div className="change-list">
                {viewMode === 'tree'
                    ? tree.map((node) => <TreeNodeView key={node.id} node={node} />)
                    : section.items.map((item) => <ChangeRow key={item.id} item={item} depth={0} />)}
            </div>
        </section>
    );
}

function TreeNodeView({ node }: { readonly node: ReturnType<typeof buildChangeTree>[number] }) {
    if (node.item) { return <ChangeRow item={node.item} depth={node.depth} />; }
    return (
        <div>
            <div className="change-row folder-row" style={depthStyle(node.depth)}>
                <span className="file-mark" aria-hidden="true" />
                <span className="file-main">{node.name}</span>
            </div>
            {node.children.map((child) => <TreeNodeView key={child.id} node={child} />)}
        </div>
    );
}

function ChangeRow({ item, depth }: { readonly item: ChangeListItem; readonly depth: number }) {
    const entry = item.entry;
    return (
        <article className="change-row" style={depthStyle(depth)} title={entry.filePath}>
            <span className={`status-dot status-${statusKind(entry)}`} aria-hidden="true" />
            <span className="file-main">{fileName(entry.filePath)}</span>
            <span className="file-path">{parentPath(entry)}</span>
            <span className="status-label">{statusLabel(entry)}</span>
        </article>
    );
}

function EmptyState({ title }: { readonly title: string }) {
    return <div className="empty-state">{title}</div>;
}

function summaryText(count: number): string {
    return count === 1 ? '1 changed file' : `${count} changed files`;
}

function operationLabel(state: 'merge' | 'rebase'): string {
    return state === 'merge' ? 'Merge' : 'Rebase';
}

function fileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
}

function parentPath(entry: StatusEntry): string {
    const parts = entry.filePath.split('/');
    parts.pop();
    const parent = parts.join('/');
    if (entry.origPath) { return `${entry.origPath} -> ${parent || '.'}`; }
    return parent;
}

function statusKind(entry: StatusEntry): string {
    const code = `${entry.indexStatus}${entry.workTreeStatus}`;
    if (code.includes('U')) { return 'conflict'; }
    if (code.includes('D')) { return 'deleted'; }
    if (code.includes('A') || code.includes('?')) { return 'added'; }
    return 'modified';
}

function depthStyle(depth: number): CSSProperties & { readonly '--depth': number } {
    return { '--depth': depth };
}
