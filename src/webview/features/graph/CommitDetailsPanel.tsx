import type { CommitFileChange } from '../../../protocol/graph/types';
import type { CommitDetails } from './graphState';
import { CommitFileTree } from './CommitFileTree';

interface CommitDetailsPanelProps {
    readonly details: CommitDetails | undefined;
    readonly loading: boolean;
    readonly onClose: () => void;
    readonly onDiff: (file: CommitFileChange) => void;
}

export function CommitDetailsPanel({ details, loading, onClose, onDiff }: CommitDetailsPanelProps) {
    return (
        <div className="graph-details-panel">
            <header className="graph-details-header">
                <button
                    type="button"
                    className="graph-details-close"
                    title="Close details"
                    aria-label="Close commit details"
                    onClick={onClose}
                >
                    <i className="codicon codicon-close" aria-hidden="true" />
                </button>
                {details && (
                    <span className="graph-details-hash" title={details.hash}>
                        {details.hash.slice(0, 8)}
                    </span>
                )}
            </header>

            {loading && (
                <div className="graph-details-loading">
                    <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                    <span>Loading…</span>
                </div>
            )}

            {!loading && details && (
                <>
                    <div className="graph-details-file-tree">
                        <CommitFileTree files={details.files} onDiff={onDiff} />
                    </div>
                    <div className="graph-details-meta">
                        <p className="graph-details-message">{details.fullMessage}</p>
                        <p className="graph-details-hash-full">{details.hash}</p>
                    </div>
                </>
            )}

            {!loading && !details && (
                <div className="graph-details-empty">
                    Select a commit to see details
                </div>
            )}
        </div>
    );
}
