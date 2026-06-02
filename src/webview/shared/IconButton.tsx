import type { MouseEvent } from 'react';

interface IconButtonProps {
    readonly icon: string;
    readonly title: string;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function IconButton({ icon, title, className, disabled = false, onClick }: IconButtonProps) {
    const classes = ['icon-button', className].filter(Boolean).join(' ');
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            className={classes}
            disabled={disabled}
            onClick={onClick}
        >
            <i className={`codicon codicon-${icon}`} aria-hidden="true" />
        </button>
    );
}
