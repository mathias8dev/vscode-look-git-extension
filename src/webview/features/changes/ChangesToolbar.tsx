import { ChangesSortMode, ChangesViewMode } from './changesState';

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
                <option value={ChangesSortMode.Path}>Path</option>
                <option value={ChangesSortMode.Status}>Status</option>
                <option value={ChangesSortMode.Directory}>Folder</option>
            </select>
            <div className="segmented" role="group" aria-label="Changes view mode">
                <button type="button" aria-pressed={viewMode === ChangesViewMode.Tree} onClick={() => onViewModeChange(ChangesViewMode.Tree)}>Tree</button>
                <button type="button" aria-pressed={viewMode === ChangesViewMode.List} onClick={() => onViewModeChange(ChangesViewMode.List)}>List</button>
            </div>
        </section>
    );
}
