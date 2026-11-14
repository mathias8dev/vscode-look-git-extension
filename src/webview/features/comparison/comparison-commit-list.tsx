import type { ComparisonState } from '@webview/features/comparison/comparison-state';
import { comparisonRefName } from '@webview/features/comparison/comparison-ref-model';
import { SearchInput } from '@webview/shared/search-input';

interface ComparisonCommitListProps {
    readonly state: ComparisonState;
    readonly onSelect: (hash: string) => void;
    readonly onSearch: (search: string) => void;
    readonly onLoadMore: () => void;
}

export function ComparisonCommitList({ state, onSelect, onSearch, onLoadMore }: ComparisonCommitListProps) {
    return <>
        <div className="comparison-search"><SearchInput value={state.commitSearch} placeholder="Message, author or hash" ariaLabel="Search comparison commits" onChange={onSearch} /></div>
        <div className="comparison-commit-list" aria-busy={Boolean(state.pending.commits)}>
        <p className="comparison-list-caption comparison-muted">Commits on {comparisonRefName(state.snapshot?.headBranch ?? '')} absent from {comparisonRefName(state.snapshot?.baseBranch ?? '')}.</p>
        {state.pending.commits ? <p className="comparison-list-caption comparison-muted" role="status">Loading commits…</p> : null}
        {state.commits?.items.map(commit => <button type="button" key={commit.hash} className="comparison-commit-row" aria-current={state.selectedCommit === commit.hash ? 'true' : undefined} onClick={() => onSelect(commit.hash)}>
            <span>{commit.message}</span><small className="comparison-muted"><code>{commit.shortHash}</code> · {commit.authorName} · {new Date(commit.authorDate).toLocaleDateString()}</small>
        </button>)}
        {state.commits?.items.length === 0 ? <p className="comparison-list-empty comparison-muted">{state.commitSearch.trim() ? 'No commits match your search.' : 'No commits unique to this branch.'}</p> : null}
        {state.commits?.hasMore ? <button type="button" className="comparison-load-more" disabled={Boolean(state.pending.commits)} onClick={onLoadMore}>{state.pending.commits ? 'Loading…' : 'Load more commits'}</button> : null}
        </div>
    </>;
}
