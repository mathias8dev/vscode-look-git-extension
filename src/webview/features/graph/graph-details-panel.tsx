import type { CSSProperties, ReactNode } from 'react';

interface GraphDetailsPanelProps {
    readonly style?: CSSProperties;
    readonly title?: string;
    readonly titleTooltip?: string;
    readonly loading: boolean;
    readonly emptyLabel: string;
    readonly onClose: () => void;
    readonly children?: ReactNode;
}

export function GraphDetailsPanel({ style, title, titleTooltip, loading, emptyLabel, onClose, children }: GraphDetailsPanelProps) {
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
                {title ? (
                    <span className="graph-details-hash" title={titleTooltip ?? title}>
                        {title}
                    </span>
                ) : null}
            </header>

            {loading ? (
                <div className="graph-details-loading">
                    <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                    <span>Loading...</span>
                </div>
            ) : children ?? (
                <div className="graph-details-empty">{emptyLabel}</div>
            )}
        </div>
    );
}
