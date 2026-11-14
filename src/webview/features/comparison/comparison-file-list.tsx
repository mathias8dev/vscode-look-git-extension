import type { ComparisonFile } from '@protocol/comparison/types';
import type { ComparisonState } from '@webview/features/comparison/comparison-state';
import { reviewKey } from '@webview/features/comparison/comparison-state';
import { CommitFileTypeIcon } from '@webview/shared/commit-file-type-icon';
import { iconKindForCommitFile } from '@webview/shared/commit-file-icon-model';
import { SearchInput } from '@webview/shared/search-input';

interface ComparisonFileListProps {
    readonly state: ComparisonState;
    readonly onSelect: (file: ComparisonFile) => void;
    readonly onSearch: (search: string) => void;
    readonly onLoadMore: () => void;
}

export function ComparisonFileList({ state, onSelect, onSearch, onLoadMore }: ComparisonFileListProps) {
    return <>
        <div className="comparison-search"><SearchInput value={state.fileSearch} placeholder="Search files" ariaLabel="Search comparison files" onChange={onSearch} /></div>
        <div className="comparison-list-caption comparison-muted">{state.files ? `${state.files.items.length} of ${state.files.matchingCount} files` : 'Loading files…'}</div>
        <div className="comparison-file-list" aria-busy={Boolean(state.pending.files)}>
            {state.files?.items.map(file => {
                const parts = file.filePath.split('/');
                const viewed = state.reviewed.includes(reviewKey(state, file.filePath));
                return <button type="button" className={`comparison-file-row${viewed ? ' comparison-viewed' : ''}`} aria-current={file.filePath === state.selectedFile ? 'true' : undefined} key={file.filePath} title={file.origPath ? `${file.origPath} → ${file.filePath}` : file.filePath} onClick={() => onSelect(file)}>
                    <CommitFileTypeIcon kind={iconKindForCommitFile(file)} />
                    <span className="comparison-file-info"><span className="comparison-file-name">{parts.pop()}</span><span className="comparison-file-directory comparison-muted">{file.origPath ? `Renamed from ${file.origPath}` : parts.join('/') || 'Repository root'}</span></span>
                    <span className={`comparison-status comparison-status-${file.status}`}>{file.status}</span>
                    {viewed ? <i className="codicon codicon-check" aria-label="Viewed" /> : null}
                </button>;
            })}
            {state.files?.items.length === 0 ? <p className="comparison-list-empty comparison-muted">{state.fileSearch ? 'No files match your search.' : 'No changed files.'}</p> : null}
            {state.files?.hasMore ? <button type="button" className="comparison-load-more" disabled={Boolean(state.pending.files)} onClick={onLoadMore}>{state.pending.files ? 'Loading…' : 'Load more files'}</button> : null}
        </div>
    </>;
}
