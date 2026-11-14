import type { HistoryCommitDetails, HistoryCommitFile } from '@protocol/history/types';
import { CommitFileTree } from '@webview/shared/commit-file-tree';
import { ViewMode } from '@webview/shared/view-mode';

interface CommitHistoryFileListProps {
    readonly details: HistoryCommitDetails | undefined;
    readonly viewMode: 'list' | 'tree';
    readonly loading: boolean;
    readonly onOpenDiff: (file: HistoryCommitFile) => void;
    readonly onFileContextMenu: (file: HistoryCommitFile) => void;
}

export function CommitHistoryFileList({ details, viewMode, loading, onOpenDiff, onFileContextMenu }: CommitHistoryFileListProps) {
    if (loading) {
        return (
            <div className="history-file-loading">
                <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                <span>Loading files...</span>
            </div>
        );
    }
    if (!details) { return null; }
    if (details.files.length === 0) { return <div className="history-file-empty">No changed files</div>; }
    return (
        <CommitFileTree
            files={details.files}
            viewMode={viewMode === 'tree' ? ViewMode.Tree : ViewMode.List}
            onDiff={onOpenDiff}
            onFileContextMenu={onFileContextMenu}
            fileContext={{ webviewSection: 'historyFile', historyFileDiffable: true, preventDefaultContextMenuItems: true }}
        />
    );
}
