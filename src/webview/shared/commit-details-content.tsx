import { useState } from 'react';
import type { CommitFileChange } from '@protocol/shared/commit';
import { ResizablePanel } from '@webview/shared/resizable-panel';
import { ResizeAxis } from '@webview/shared/resize-axis';
import { ResizeHandleSide } from '@webview/shared/resize-handle-side';
import { SearchInput } from '@webview/shared/search-input';
import { ViewModeToggle } from '@webview/shared/view-mode-toggle';
import { ViewMode } from '@webview/shared/view-mode';
import { readViewMode, writeViewMode } from '@webview/shared/view-mode-storage';
import { CommitFileTree } from '@webview/shared/commit-file-tree';
import { filterCommitDetailFiles } from '@webview/shared/commit-file-filter';

const COMMIT_MESSAGE_PANEL_MIN = 72;
const COMMIT_MESSAGE_PANEL_MAX = 420;
const COMMIT_MESSAGE_PANEL_DEFAULT = 140;
const COMMIT_MESSAGE_PANEL_STORAGE_KEY = 'lookGit.commitDetailsMessagePanelHeight';
const COMMIT_DETAILS_FILE_VIEW_MODE_STORAGE_KEY = 'lookGit.commitDetailsFileViewMode';

interface CommitDetailsContentProps {
    readonly details: { readonly hash: string; readonly fullMessage: string; readonly files: readonly CommitFileChange[] };
    readonly onDiff: (file: CommitFileChange) => void;
    readonly search?: string;
    readonly onSearch?: (search: string) => void;
    readonly hasMore?: boolean;
    readonly loadingMore?: boolean;
    readonly onLoadMore?: () => void;
    readonly submodulesDiffable?: boolean;
}

export function CommitDetailsContent({ details, onDiff, search, onSearch, hasMore = false, loadingMore = false, onLoadMore, submodulesDiffable = true }: CommitDetailsContentProps) {
    const [fileSearch, setFileSearch] = useState('');
    const [fileViewMode, setFileViewMode] = useState(() => readViewMode(COMMIT_DETAILS_FILE_VIEW_MODE_STORAGE_KEY, ViewMode.Tree));
    const visibleSearch = search ?? fileSearch;
    const filteredFiles = onSearch ? details.files : filterCommitDetailFiles(details.files, visibleSearch);

    const changeFileViewMode = (nextViewMode: ViewMode) => {
        setFileViewMode(nextViewMode);
        writeViewMode(COMMIT_DETAILS_FILE_VIEW_MODE_STORAGE_KEY, nextViewMode);
    };

    return (
        <>
            <div className="graph-details-file-search">
                <SearchInput
                    value={visibleSearch}
                    placeholder="Search files"
                    ariaLabel="Search changed files"
                    onChange={onSearch ?? setFileSearch}
                />
                <ViewModeToggle viewMode={fileViewMode} onChange={changeFileViewMode} />
            </div>
            <div className="graph-details-file-tree">
                {filteredFiles.length > 0 ? (
                    <CommitFileTree files={filteredFiles} viewMode={fileViewMode} onDiff={onDiff} submodulesDiffable={submodulesDiffable} />
                ) : (
                    <div className="graph-details-file-empty">No files match</div>
                )}
                {hasMore && onLoadMore ? <button type="button" className="comparison-load-more" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading…' : 'Load more files'}</button> : null}
            </div>
            <ResizablePanel
                storageKey={COMMIT_MESSAGE_PANEL_STORAGE_KEY}
                defaultSize={COMMIT_MESSAGE_PANEL_DEFAULT}
                minSize={COMMIT_MESSAGE_PANEL_MIN}
                maxSize={COMMIT_MESSAGE_PANEL_MAX}
                axis={ResizeAxis.Vertical}
                handleSide={ResizeHandleSide.Start}
                ariaLabel="Resize commit message panel"
                title="Drag or use arrow keys to resize commit message panel"
            >
                {(style) => (
                    <div className="graph-details-meta" style={style}>
                        <p className="graph-details-message">{details.fullMessage}</p>
                        <p className="graph-details-hash-full">{details.hash}</p>
                    </div>
                )}
            </ResizablePanel>
        </>
    );
}
