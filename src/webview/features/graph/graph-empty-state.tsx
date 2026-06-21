interface GraphEmptyStateProps {
    readonly title: string;
    readonly subtitle: string;
    readonly actionLabel?: string;
    readonly onAction?: () => void;
}

export function GraphEmptyState({ title, subtitle, actionLabel, onAction }: GraphEmptyStateProps) {
    return (
        <div className="graph-empty-state">
            <i className="codicon codicon-git-commit graph-empty-state-icon" aria-hidden="true" />
            <span className="graph-empty-state-title">{title}</span>
            <span className="graph-empty-state-subtitle">{subtitle}</span>
            {actionLabel && onAction ? (
                <button type="button" className="graph-empty-state-action" onClick={onAction}>
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}
