import type { MouseEvent } from 'react';

interface IconButtonProps {
    readonly icon: string;
    readonly title: string;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly busy?: boolean;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function IconButton({ icon, title, className, disabled = false, busy = false, onClick }: IconButtonProps) {
    const classes = ['icon-button', busy ? 'icon-button-busy' : undefined, className].filter(Boolean).join(' ');
    const iconClass = busy ? 'codicon codicon-loading codicon-modifier-spin' : `codicon codicon-${icon}`;
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            aria-busy={busy ? 'true' : undefined}
            className={classes}
            disabled={disabled || busy}
            onClick={onClick}
        >
            <i className={iconClass} aria-hidden="true" />
        </button>
    );
}
