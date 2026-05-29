interface EmptyStateProps {
    readonly title: string;
}

export function EmptyState({ title }: EmptyStateProps) {
    return <div className="empty-state">{title}</div>;
}
