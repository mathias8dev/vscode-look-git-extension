import type { ChangesSortMode, ChangesViewMode } from './changesState';

interface ChangesToolbarProps {
    readonly pathFilter: string;
    readonly sortMode: ChangesSortMode;
    readonly viewMode: ChangesViewMode;
    readonly onPathFilterChange: (value: string) => void;
    readonly onSortModeChange: (value: ChangesSortMode) => void;
    readonly onViewModeChange: (viewMode: ChangesViewMode) => void;
}

export function ChangesToolbar({
    pathFilter,
    sortMode,
    viewMode,
    onPathFilterChange,
    onSortModeChange,
    onViewModeChange,
}: ChangesToolbarProps) {
    return (
        <section className="changes-toolbar" aria-label="Changes controls">
            <input
                type="search"
                value={pathFilter}
                placeholder="Filter by path"
                aria-label="Filter by path"
                onChange={(event) => onPathFilterChange(event.currentTarget.value)}
            />
            <select
                value={sortMode}
                aria-label="Sort changes"
                onChange={(event) => onSortModeChange(event.currentTarget.value as ChangesSortMode)}
            >
                <option value="path">Path</option>
                <option value="status">Status</option>
                <option value="directory">Folder</option>
            </select>
            <div className="segmented" role="group" aria-label="Changes view mode">
                <button type="button" aria-pressed={viewMode === 'tree'} onClick={() => onViewModeChange('tree')}>Tree</button>
                <button type="button" aria-pressed={viewMode === 'list'} onClick={() => onViewModeChange('list')}>List</button>
            </div>
        </section>
    );
}
