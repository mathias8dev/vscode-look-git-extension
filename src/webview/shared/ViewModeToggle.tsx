import { IconButton } from '@webview/shared/IconButton';
import { ViewMode } from '@webview/shared/viewMode';

interface ViewModeToggleProps {
    readonly viewMode: ViewMode;
    readonly className?: string;
    readonly onChange: (viewMode: ViewMode) => void;
}

export function ViewModeToggle({ viewMode, className, onChange }: ViewModeToggleProps) {
    const nextMode = viewMode === ViewMode.Tree ? ViewMode.List : ViewMode.Tree;
    const classes = ['view-mode-toggle', className].filter(Boolean).join(' ');
    return (
        <IconButton
            icon={nextMode === ViewMode.List ? 'list-unordered' : 'list-tree'}
            title={nextMode === ViewMode.List ? 'View as List' : 'View as Tree'}
            className={classes}
            onClick={() => onChange(nextMode)}
        />
    );
}
