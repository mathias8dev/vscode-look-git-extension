import type { CSSProperties } from 'react';
import type { BranchDetails, GraphCommit } from '@protocol/graph/types';
import { GraphDetailsPanel } from '@webview/features/graph/graph-details-panel';

interface BranchDetailsPanelProps {
    readonly style?: CSSProperties;
    readonly details: BranchDetails | undefined;
    readonly loading: boolean;
    readonly loadingMore: boolean;
    readonly onClose: () => void;
    readonly onLoadMore: () => void;
    readonly onSelectCommit: (hash: string) => void;
}

export function BranchDetailsPanel({ style, details, loading, loadingMore, onClose, onLoadMore, onSelectCommit }: BranchDetailsPanelProps) {
    return (
        <GraphDetailsPanel
            style={style}
            title={details?.name}
            loading={loading}
            emptyLabel="Select a branch to see details"
            onClose={onClose}
        >
            {details ? (
                <div className="branch-details-content">
                    <section className="branch-details-section" aria-labelledby="branch-details-summary">
                        <h3 id="branch-details-summary">Branch</h3>
                        <dl className="branch-details-grid">
                            {branchFacts(details).map((fact) => (
                                <div className="branch-details-fact" key={fact.label}>
                                    <dt>{fact.label}</dt>
                                    <dd className={fact.monospace ? 'branch-details-monospace' : undefined} title={fact.value}>
                                        {fact.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>

                    <section className="branch-details-section branch-details-commits" aria-labelledby="branch-details-commits">
                        <h3 id="branch-details-commits">Recent commits</h3>
                        {details.commits.length > 0 ? (
                            <div className="branch-details-commit-list">
                                {details.commits.map((commit) => (
                                    <button
                                        key={commit.hash}
                                        type="button"
                                        className="branch-details-commit"
                                        title={commit.hash}
                                        onClick={() => onSelectCommit(commit.hash)}
                                    >
                                        <span className="branch-details-commit-message">{commit.message}</span>
                                        <span className="branch-details-commit-meta">
                                            <span className="branch-details-short-hash">{commit.shortHash}</span>
                                            <span>{commit.authorName}</span>
                                            <time dateTime={commit.authorDate}>{formatDate(commit.authorDate)}</time>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="graph-details-file-empty">No commits</div>
                        )}
                        {details.hasMore ? (
                            <button
                                type="button"
                                className="branch-details-load-more"
                                disabled={loadingMore}
                                onClick={onLoadMore}
                            >
                                {loadingMore ? 'Loading...' : 'Load more'}
                            </button>
                        ) : null}
                    </section>
                </div>
            ) : undefined}
        </GraphDetailsPanel>
    );
}

function branchFacts(details: BranchDetails): readonly { readonly label: string; readonly value: string; readonly monospace?: boolean }[] {
    return [
        { label: 'Name', value: details.name },
        { label: 'Type', value: details.isRemote ? 'Remote' : 'Local' },
        { label: 'Current', value: details.isCurrent ? 'Yes' : 'No' },
        { label: 'Remote', value: details.remote ?? 'None' },
        { label: 'Remote URL', value: details.remoteUrl ?? 'Not configured' },
        { label: 'Upstream', value: details.upstream ?? 'Not configured' },
        { label: 'Tracking', value: trackingLabel(details) },
        { label: 'HEAD', value: details.head?.hash ?? 'No commits', monospace: true },
        { label: parentLabel(details.head), value: parentValue(details.head), monospace: true },
        { label: 'Origin branch', value: 'Not recorded by Git' },
    ];
}

function trackingLabel(details: BranchDetails): string {
    if (!details.upstream) { return 'Not configured'; }
    return `${details.ahead ?? 0} ahead, ${details.behind ?? 0} behind`;
}

function parentLabel(head: GraphCommit | undefined): string {
    return head && head.parentHashes.length > 1 ? 'Parent commits' : 'Parent commit';
}

function parentValue(head: GraphCommit | undefined): string {
    if (!head) { return 'No commits'; }
    if (head.parentHashes.length === 0) { return 'Root commit'; }
    return head.parentHashes.join(', ');
}

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
