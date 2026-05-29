export type CodiconName =
    | 'add'
    | 'check'
    | 'chevron-down'
    | 'chevron-right'
    | 'diff'
    | 'fold-down'
    | 'fold-up'
    | 'folder-opened'
    | 'git-merge'
    | 'go-to-file'
    | 'loading'
    | 'pass'
    | 'remove'
    | 'search'
    | 'source-control'
    | 'trash';

interface CodiconProps {
    readonly name: CodiconName;
    readonly className?: string;
    readonly spin?: boolean;
}

export function Codicon({ name, className, spin = false }: CodiconProps) {
    const classes = [
        'codicon',
        `codicon-${name}`,
        spin ? 'codicon-modifier-spin' : undefined,
        className,
    ].filter(Boolean).join(' ');
    return <i className={classes} aria-hidden="true" />;
}
