import type { CSSProperties } from 'react';
import type { CommitFileChange } from '../../../protocol/graph/types';
import type { CommitDetails } from './graphState';
import { CommitDetailsContent } from './CommitDetailsContent';

interface CommitDetailsPanelProps {
    readonly style?: CSSProperties;
    readonly details: CommitDetails | undefined;
    readonly loading: boolean;
    readonly onClose: () => void;
    readonly onDiff: (file: CommitFileChange) => void;
}

export function CommitDetailsPanel({ style, details, loading, onClose, onDiff }: CommitDetailsPanelProps) {
    const title = details?.kind === 'worktree'
        ? details.branch ?? worktreeName(details.path ?? details.hash)
        : details?.hash.slice(0, 8);
    const detailsKey = details ? `${details.kind}:${details.path ?? details.hash}` : undefined;

    return (
        <div className="graph-details-panel" style={style}>
            <header className="graph-details-header">
                <button
                    type="button"
                    className="graph-details-close"
                    title="Close details"
                    aria-label="Close details"
                    onClick={onClose}
                >
                    <i className="codicon codicon-close" aria-hidden="true" />
                </button>
                {details && (
                    <span className="graph-details-hash" title={details.path ?? details.hash}>
                        {title}
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
                <CommitDetailsContent key={detailsKey} details={details} onDiff={onDiff} />
            )}

            {!loading && !details && (
                <div className="graph-details-empty">
                    Select a commit to see details
                </div>
            )}
        </div>
    );
}

function worktreeName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
