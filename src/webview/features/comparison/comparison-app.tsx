import type { ComparisonChannel } from '@protocol/comparison/messages';
import { ComparisonMode } from '@protocol/comparison/types';
import type { CommitFileChange } from '@protocol/shared/commit';
import type { ComparisonSettings, ComparisonState } from '@webview/features/comparison/comparison-state';
import { ComparisonFileList } from '@webview/features/comparison/comparison-file-list';
import { ComparisonCommitList } from '@webview/features/comparison/comparison-commit-list';
import { ComparisonFileSummary } from '@webview/features/comparison/comparison-file-summary';
import { ComparisonCommitPreview } from '@webview/features/comparison/comparison-commit-preview';
import { reviewKey } from '@webview/features/comparison/comparison-state';
import { comparisonRefName } from '@webview/features/comparison/comparison-ref-model';
import { ErrorNotice } from '@webview/shared/error-notice';
import { IconButton } from '@webview/shared/icon-button';
import { Dropdown } from '@webview/shared/dropdown';
import { ResizablePanel } from '@webview/shared/resizable-panel';
import { ResizeAxis } from '@webview/shared/resize-axis';
import { ResizeHandleSide } from '@webview/shared/resize-handle-side';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 640;
const SIDEBAR_DEFAULT = 280;
const SIDEBAR_STORAGE_KEY = 'lookGit.comparisonSidebarWidth';

export interface ComparisonAppActions {
    readonly compare: (settings: ComparisonSettings) => void;
    readonly branches: (search: string, cursor?: string) => void;
    readonly files: (search: string, more?: boolean) => void;
    readonly commits: (search: string, more?: boolean) => void;
    readonly selectFile: (path: string) => void;
    readonly selectCommit: (hash: string) => void;
    readonly details: (search: string, more?: boolean) => void;
    readonly tab: (tab: 'files' | 'commits') => void;
    readonly review: (path: string) => void;
    readonly openDiff: (file: CommitFileChange, commitHash?: string) => void;
    readonly retry: (channel: ComparisonChannel) => void;
    readonly cancel: (channel: ComparisonChannel) => void;
}

interface ComparisonAppProps {
    readonly state: ComparisonState;
    readonly actions: ComparisonAppActions;
}

export function ComparisonApp({ state, actions }: ComparisonAppProps) {
    const snapshot = state.snapshot;
    const baseName = comparisonRefName(state.settings.baseBranch);
    const headName = comparisonRefName(state.settings.headBranch);
    const reviewedCount = snapshot
        ? state.reviewed.filter(key => key.startsWith(`${snapshot.leftHash}:${snapshot.headHash}:`)).length
        : 0;
    const selectedIndex = state.files?.items.findIndex(file => file.filePath === state.selectedFile) ?? -1;
    const selectedFile = state.files?.items[selectedIndex];
    const loadingChannel = state.pending.init ? 'init' : state.pending.comparison ? 'comparison' : undefined;
    const choose = (key: 'baseBranch' | 'headBranch', value: string) => {
        actions.compare({ ...state.settings, [key]: value });
    };
    const move = (offset: number) => {
        const file = state.files?.items[selectedIndex + offset];
        if (file) { actions.selectFile(file.filePath); }
    };

    return (
        <main className="comparison-app">
            <header className="comparison-header">
                <div className="comparison-heading">
                    <i className="codicon codicon-git-compare" aria-hidden="true" />
                    <h1>Compare branches</h1>
                    <span className="comparison-muted">{state.repositoryLabel}</span>
                    <span className="comparison-spacer" />
                    <IconButton
                        icon="refresh"
                        title="Refresh comparison"
                        onClick={() => actions.compare(state.settings)}
                        disabled={!state.settings.baseBranch || Boolean(state.pending.comparison)}
                    />
                </div>
                <div className="comparison-controls">
                    {(['baseBranch', 'headBranch'] as const).map((key, index) => (
                        <div className="comparison-control-slot" key={key}>
                            {index === 1 ? (
                                <IconButton
                                    icon="arrow-swap"
                                    title="Swap base and branch to examine"
                                    onClick={() => actions.compare({
                                        ...state.settings,
                                        baseBranch: state.settings.headBranch,
                                        headBranch: state.settings.baseBranch,
                                    })}
                                    disabled={!state.settings.baseBranch}
                                />
                            ) : null}
                            <label className="comparison-branch-picker">
                                <span className="comparison-field-label">{index === 0 ? 'Base' : 'Branch to examine'}</span>
                                <Dropdown
                                    ariaLabel={index === 0 ? 'Base' : 'Branch to examine'}
                                    value={state.branches?.items.find(branch => branch.name === state.settings[key])?.ref ?? state.settings[key]}
                                    displayValue={comparisonRefName(state.settings[key]) || 'Select a branch'}
                                    searchable
                                    searchPlaceholder="Search branches"
                                    options={(state.branches?.items ?? []).map(branch => ({ value: branch.ref, label: branch.name,
                                        description: branch.isRemote ? 'remote' : undefined }))}
                                    loading={Boolean(state.pending.branches)}
                                    onOpen={() => actions.branches('')}
                                    onChange={value => choose(key, value)}
                                    onSearch={actions.branches}
                                    onLoadMore={state.branches?.hasMore ? search => actions.branches(search, state.branches?.cursor) : undefined}
                                />
                            </label>
                        </div>
                    ))}
                    <label className="comparison-mode">
                        <span className="comparison-field-label">Scope</span>
                        <Dropdown<ComparisonMode>
                            ariaLabel="Comparison scope"
                            value={state.settings.mode}
                            onChange={mode => actions.compare({ ...state.settings, mode })}
                            disabled={!state.settings.baseBranch}
                            options={[
                                { value: ComparisonMode.SinceDivergence, label: 'Changes since divergence' },
                                { value: ComparisonMode.BranchTips, label: 'Difference between branch tips' },
                            ]}
                        />
                    </label>
                </div>
                <p className="comparison-explanation comparison-muted">
                    {state.settings.mode === ComparisonMode.SinceDivergence
                        ? `Changes on ${headName || 'the selected branch'} since its common ancestor with ${baseName || 'the base'}.`
                        : 'Differences between the latest commits of both branches.'}
                    <code>{baseName}{state.settings.mode === ComparisonMode.SinceDivergence ? '...' : '..'}{headName}</code>
                </p>
            </header>
            {state.stale && snapshot ? (
                <div className="comparison-stale" role="status">
                    <i className="codicon codicon-info" aria-hidden="true" />
                    <span>Branches changed. You are reviewing pinned revisions.</span>
                    <button type="button" className="comparison-button" onClick={() => actions.compare(state.settings)}>
                        Refresh comparison
                    </button>
                </div>
            ) : null}
            {(['init', 'comparison', 'branches', 'files', 'commits', 'open'] satisfies ComparisonChannel[]).map(channel => (
                <ErrorNotice
                    key={channel}
                    error={state.errors[channel]}
                    primaryAction={{ label: 'Retry', onClick: () => actions.retry(channel) }}
                />
            ))}
            {loadingChannel ? (
                <div className="comparison-loading" role="status">
                    <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                    {loadingChannel === 'init' ? 'Loading repository…' : 'Comparing branches…'}
                    <button type="button" className="comparison-button" onClick={() => actions.cancel(loadingChannel)}>Cancel</button>
                </div>
            ) : null}
            {snapshot ? (
                <>
                    <section className="comparison-summary" aria-label="Comparison summary">
                        <span><strong>{snapshot.files.totalCount}</strong> changed files</span>
                        <span className="comparison-add">+{snapshot.files.additions}</span>
                        <span className="comparison-delete">−{snapshot.files.deletions}</span>
                        <span className="comparison-muted">{snapshot.commits.totalCount} commits unique to {comparisonRefName(snapshot.headBranch)}</span>
                        <span className="comparison-spacer" />
                        <progress max={Math.max(snapshot.files.totalCount, 1)} value={reviewedCount} aria-label="Review progress" />
                        <span className="comparison-muted">{reviewedCount}/{snapshot.files.totalCount} viewed</span>
                    </section>
                    <div className="comparison-workspace">
                        <ResizablePanel
                            storageKey={SIDEBAR_STORAGE_KEY}
                            defaultSize={SIDEBAR_DEFAULT}
                            minSize={SIDEBAR_MIN}
                            maxSize={SIDEBAR_MAX}
                            axis={ResizeAxis.Horizontal}
                            handleSide={ResizeHandleSide.End}
                            ariaLabel="Resize comparison results"
                            title="Drag or use arrow keys to resize comparison results"
                        >
                            {style => (
                                <aside className="comparison-sidebar" style={style} aria-label="Comparison results">
                                    <div className="comparison-tabs" role="tablist" aria-label="Comparison content">
                                        {(['files', 'commits'] as const).map(tab => (
                                            <button
                                                type="button"
                                                key={tab}
                                                id={`comparison-${tab}-tab`}
                                                role="tab"
                                                aria-selected={state.tab === tab}
                                                aria-controls={`comparison-${tab}-panel`}
                                                tabIndex={state.tab === tab ? 0 : -1}
                                                onClick={() => actions.tab(tab)}
                                                onKeyDown={event => {
                                                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { return; }
                                                    event.preventDefault();
                                                    const next = event.key === 'Home' ? 'files'
                                                        : event.key === 'End' ? 'commits'
                                                            : tab === 'files' ? 'commits' : 'files';
                                                    actions.tab(next);
                                                    document.getElementById(`comparison-${next}-tab`)?.focus();
                                                }}
                                            >
                                                {tab === 'files' ? 'Files' : 'Commits'}
                                                <span className="comparison-badge">{tab === 'files' ? snapshot.files.totalCount : snapshot.commits.totalCount}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <section id="comparison-files-panel" role="tabpanel" aria-labelledby="comparison-files-tab" hidden={state.tab !== 'files'}>
                                        <ComparisonFileList
                                            state={state}
                                            onSelect={file => actions.selectFile(file.filePath)}
                                            onSearch={search => actions.files(search)}
                                            onLoadMore={() => actions.files(state.fileSearch, true)}
                                        />
                                    </section>
                                    <section id="comparison-commits-panel" role="tabpanel" aria-labelledby="comparison-commits-tab" hidden={state.tab !== 'commits'}>
                                        <ComparisonCommitList state={state} onSelect={actions.selectCommit} onSearch={search => actions.commits(search)} onLoadMore={() => actions.commits(state.commitSearch, true)} />
                                    </section>
                                </aside>
                            )}
                        </ResizablePanel>
                        <section className="comparison-preview" aria-label={state.tab === 'files' ? 'File summary' : 'Commit details'}>
                            {state.tab === 'commits' ? <ErrorNotice error={state.errors.details} primaryAction={{ label: 'Retry', onClick: () => actions.retry('details') }} /> : null}
                            {state.tab === 'files' ? (
                                <ComparisonFileSummary
                                    state={state}
                                    onReview={actions.review}
                                    onOpen={() => { if (selectedFile) { actions.openDiff(selectedFile); } }}
                                />
                            ) : (
                                <ComparisonCommitPreview
                                    state={state}
                                    onDiff={file => actions.openDiff(file, state.selectedCommit)}
                                    onSearch={search => actions.details(search)}
                                    onLoadMore={() => actions.details(state.detailSearch, true)}
                                />
                            )}
                            {state.tab === 'files' ? (
                                <footer className="comparison-preview-footer">
                                    <span className="comparison-muted">
                                        {selectedIndex >= 0 ? `File ${selectedIndex + 1} of ${state.files?.matchingCount}` : 'Read-only comparison'}
                                        {selectedFile && state.reviewed.includes(reviewKey(state, selectedFile.filePath)) ? ' · Viewed' : ''}
                                    </span>
                                    <span className="comparison-spacer" />
                                    <button type="button" className="comparison-button" disabled={selectedIndex <= 0} onClick={() => move(-1)}>Previous</button>
                                    <button type="button" className="comparison-button" disabled={selectedIndex < 0 || selectedIndex >= (state.files?.items.length ?? 0) - 1} onClick={() => move(1)}>Next</button>
                                </footer>
                            ) : null}
                        </section>
                    </div>
                    <footer className="comparison-statusbar">
                        <span>Uncommitted changes excluded</span>
                        <span className="comparison-spacer" />
                        <code>Pinned revisions · {snapshot.baseHash.slice(0, 8)} / {snapshot.headHash.slice(0, 8)}</code>
                    </footer>
                </>
            ) : !loadingChannel ? (
                <div className="comparison-empty">
                    <h2>Comparison stopped</h2>
                    <button type="button" className="comparison-button" onClick={() => state.settings.baseBranch ? actions.compare(state.settings) : actions.retry('init')}>
                        {state.settings.baseBranch ? 'Compare branches' : 'Load repository'}
                    </button>
                </div>
            ) : null}
        </main>
    );
}
