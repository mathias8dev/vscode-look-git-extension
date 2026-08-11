import type { CSSProperties } from 'react';
import type { CommitFileChange } from '@protocol/graph/types';
import type { CommitDetails } from '@webview/features/graph/graph-state';
import { CommitDetailsContent } from '@webview/features/graph/commit-details-content';
import { GraphDetailsPanel } from '@webview/features/graph/graph-details-panel';

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
        <GraphDetailsPanel
            style={style}
            title={title}
            titleTooltip={details?.path ?? details?.hash}
            loading={loading}
            emptyLabel="Select a commit to see details"
            onClose={onClose}
        >
            {details ? (
                <CommitDetailsContent key={detailsKey} details={details} onDiff={onDiff} />
            ) : undefined}
        </GraphDetailsPanel>
    );
}

function worktreeName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
