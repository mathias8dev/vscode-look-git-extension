import { useState } from 'react';
import type { CommitFileChange } from '../../../protocol/graph/types';
import { ResizablePanel } from '../../shared/ResizablePanel';
import { ResizeAxis } from '../../shared/resizeAxis';
import { ResizeHandleSide } from '../../shared/resizeHandleSide';
import { SearchInput } from '../../shared/SearchInput';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { ViewMode } from '../../shared/viewMode';
import { readViewMode, writeViewMode } from '../../shared/viewModeStorage';
import { CommitFileTree } from './CommitFileTree';
import { filterCommitDetailFiles } from './commitDetailsModel';
import type { CommitDetails } from './graphState';

const COMMIT_MESSAGE_PANEL_MIN = 72;
const COMMIT_MESSAGE_PANEL_MAX = 420;
const COMMIT_MESSAGE_PANEL_DEFAULT = 140;
const COMMIT_MESSAGE_PANEL_STORAGE_KEY = 'lookGit.commitDetailsMessagePanelHeight';
const COMMIT_DETAILS_FILE_VIEW_MODE_STORAGE_KEY = 'lookGit.commitDetailsFileViewMode';

interface CommitDetailsContentProps {
    readonly details: CommitDetails;
    readonly onDiff: (file: CommitFileChange) => void;
}

export function CommitDetailsContent({ details, onDiff }: CommitDetailsContentProps) {
    const [fileSearch, setFileSearch] = useState('');
    const [fileViewMode, setFileViewMode] = useState(() => readViewMode(COMMIT_DETAILS_FILE_VIEW_MODE_STORAGE_KEY, ViewMode.Tree));
    const filteredFiles = filterCommitDetailFiles(details.files, fileSearch);

    const changeFileViewMode = (nextViewMode: ViewMode) => {
        setFileViewMode(nextViewMode);
        writeViewMode(COMMIT_DETAILS_FILE_VIEW_MODE_STORAGE_KEY, nextViewMode);
    };

    return (
        <>
            <div className="graph-details-file-search">
                <SearchInput
                    value={fileSearch}
                    placeholder="Search files"
                    ariaLabel="Search changed files"
                    onChange={setFileSearch}
                />
                <ViewModeToggle viewMode={fileViewMode} onChange={changeFileViewMode} />
            </div>
            <div className="graph-details-file-tree">
                {filteredFiles.length > 0 ? (
                    <CommitFileTree files={filteredFiles} viewMode={fileViewMode} onDiff={onDiff} />
                ) : (
                    <div className="graph-details-file-empty">No files match</div>
                )}
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
