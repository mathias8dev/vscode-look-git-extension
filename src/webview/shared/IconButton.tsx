import type { MouseEvent } from 'react';

interface IconButtonProps {
    readonly icon: string;
    readonly title: string;
    readonly className?: string;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function IconButton({ icon, title, className, onClick }: IconButtonProps) {
    const classes = ['icon-button', className].filter(Boolean).join(' ');
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            className={classes}
            onClick={onClick}
        >
            <i className={`codicon codicon-${icon}`} aria-hidden="true" />
        </button>
    );
}
