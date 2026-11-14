import type { CommitFileChange } from '@protocol/shared/commit';
import type { ComparisonState } from '@webview/features/comparison/comparison-state';
import { CommitDetailsContent } from '@webview/shared/commit-details-content';

interface ComparisonCommitPreviewProps {
    readonly state: ComparisonState;
    readonly onDiff: (file: CommitFileChange) => void;
    readonly onSearch: (search: string) => void;
    readonly onLoadMore: () => void;
}

export function ComparisonCommitPreview({ state, onDiff, onSearch, onLoadMore }: ComparisonCommitPreviewProps) {
    if (!state.selectedCommit && state.pending.commits) return <div className="comparison-empty"><h2>Loading commits…</h2></div>;
    if (!state.selectedCommit && state.errors.commits) return <div className="comparison-empty"><h2>Commit list unavailable</h2><p className="comparison-muted">Retry loading commits to continue.</p></div>;
    if (!state.selectedCommit) return <div className="comparison-empty"><h2>{state.commitSearch.trim() ? 'No matching commits' : 'No commits to inspect'}</h2><p className="comparison-muted">{state.commitSearch.trim() ? 'Try another message, author or hash.' : 'This branch has no commits absent from the base.'}</p></div>;
    const details = state.details;
    return <>
        <header className="comparison-preview-toolbar"><i className="codicon codicon-git-commit" aria-hidden="true" /><code>{state.selectedCommit.slice(0, 8)}</code><span className="comparison-muted">Commit details</span></header>
        {details ? <CommitDetailsContent key={details.hash} details={{ hash: details.hash, fullMessage: details.fullMessage, files: details.files.items }} onDiff={onDiff} submodulesDiffable={false} search={state.detailSearch} onSearch={onSearch} hasMore={details.files.hasMore} loadingMore={Boolean(state.pending.details)} onLoadMore={onLoadMore} /> : state.pending.details ? <p className="comparison-loading" role="status">Loading commit details…</p> : null}
    </>;
}
