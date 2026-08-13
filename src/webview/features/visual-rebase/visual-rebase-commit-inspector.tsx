import { useState } from 'react';
import type { CommitFileChange } from '@protocol/shared/commit';
import type { VisualRebaseCommit, VisualRebaseCommitDetails } from '@protocol/visual-rebase/types';
import { CommitFileTree } from '@webview/shared/commit-file-tree';
import { filterCommitDetailFiles } from '@webview/shared/commit-file-filter';
import { Codicon } from '@webview/shared/codicon';
import { SearchInput } from '@webview/shared/search-input';
import { ViewMode } from '@webview/shared/view-mode';
import { readViewMode, writeViewMode } from '@webview/shared/view-mode-storage';
import { ViewModeToggle } from '@webview/shared/view-mode-toggle';

const FILE_VIEW_MODE_STORAGE_KEY = 'lookGit.visualRebaseFileViewMode';

interface VisualRebaseCommitInspectorProps {
    readonly commit: VisualRebaseCommit;
    readonly details: VisualRebaseCommitDetails | undefined;
    readonly loading: boolean;
    readonly error: string | undefined;
    readonly onMessageChange: (message: string) => void;
    readonly onOpenDiff: (file: CommitFileChange) => void;
}

export function VisualRebaseCommitInspector({ commit, details, loading, error, onMessageChange, onOpenDiff }: VisualRebaseCommitInspectorProps) {
    const [fileSearch, setFileSearch] = useState('');
    const [fileViewMode, setFileViewMode] = useState(() => readViewMode(FILE_VIEW_MODE_STORAGE_KEY, ViewMode.Tree));
    const files = details?.hash === commit.hash ? details.files : [];
    const filteredFiles = filterCommitDetailFiles(files, fileSearch);

    const changeFileViewMode = (nextViewMode: ViewMode) => {
        setFileViewMode(nextViewMode);
        writeViewMode(FILE_VIEW_MODE_STORAGE_KEY, nextViewMode);
    };

    return (
        <>
            <div className="visual-rebase-inspector-summary">
                <code>{commit.shortHash}</code>
                <span>{commit.action}</span>
                <strong title={commit.message}>{commit.message}</strong>
            </div>
            <section className="visual-rebase-inspector-files" aria-label={`Files changed by ${commit.shortHash}`}>
                <div className="visual-rebase-inspector-files-heading">
                    <h3>Changed Files</h3>
                    {!loading && !error ? <span>{files.length}</span> : null}
                </div>
                {files.length > 0 ? (
                    <div className="graph-details-file-search">
                        <SearchInput
                            value={fileSearch}
                            placeholder="Search files"
                            ariaLabel="Search changed files"
                            onChange={setFileSearch}
                        />
                        <ViewModeToggle viewMode={fileViewMode} onChange={changeFileViewMode} />
                    </div>
                ) : null}
                <div className="graph-details-file-tree">
                    {loading ? (
                        <div className="graph-details-loading"><Codicon name="loading" spin /> Loading changed files</div>
                    ) : error ? (
                        <div className="visual-rebase-inspector-error" role="alert">{error}</div>
                    ) : filteredFiles.length > 0 ? (
                        <CommitFileTree key={commit.hash} files={filteredFiles} viewMode={fileViewMode} onDiff={onOpenDiff} />
                    ) : (
                        <div className="graph-details-file-empty">{files.length > 0 ? 'No files match' : 'No changed files'}</div>
                    )}
                </div>
            </section>
            <label className="visual-rebase-message-editor">
                <span>Reword message</span>
                <textarea
                    value={commit.message}
                    disabled={commit.action !== 'reword'}
                    onChange={(event) => onMessageChange(event.target.value)}
                />
            </label>
        </>
    );
}
