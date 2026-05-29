import { Codicon, type CodiconName } from '../../shared/Codicon';

interface EmptyStateProps {
    readonly title: string;
    readonly subtitle?: string;
    readonly icon?: CodiconName;
    readonly iconSpin?: boolean;
}

export function EmptyState({ title, subtitle, icon, iconSpin = false }: EmptyStateProps) {
    return (
        <div className="empty-state">
            {icon ? <Codicon name={icon} className="empty-state-icon" spin={iconSpin} /> : null}
            <span className="empty-state-title">{title}</span>
            {subtitle ? <span className="empty-state-subtitle">{subtitle}</span> : null}
        </div>
    );
}
