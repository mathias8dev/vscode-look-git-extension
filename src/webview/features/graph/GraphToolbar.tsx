import { useRef } from 'react';
import type { BranchInfo, GraphFilters } from '../../../protocol/graph/types';
import { SearchInput } from '../../shared/SearchInput';

interface GraphToolbarProps {
    readonly filters: GraphFilters;
    readonly branches: readonly BranchInfo[];
    readonly selectedBranchFilter: string | undefined;
    readonly refreshing?: boolean;
    readonly onFiltersChange: (filters: Partial<GraphFilters>) => void;
    readonly onBranchFilterChange: (branch: string | undefined) => void;
    readonly onRefresh: () => void;
}

export function GraphToolbar({
    filters,
    branches,
    selectedBranchFilter,
    refreshing = false,
    onFiltersChange,
    onBranchFilterChange,
    onRefresh,
}: GraphToolbarProps) {
    const searchRef = useRef<HTMLInputElement>(null);

    return (
        <div className="graph-toolbar">
            <SearchInput
                className="graph-toolbar-search"
                inputRef={searchRef}
                value={filters.search ?? ''}
                placeholder="Text or hash"
                ariaLabel="Search commits"
                onChange={(value) => onFiltersChange({ search: value || undefined })}
            />

            <select
                className="graph-filter-select"
                value={selectedBranchFilter ?? ''}
                aria-label="Filter by branch"
                onChange={(e) => onBranchFilterChange(e.currentTarget.value || undefined)}
            >
                <option value="">All branches</option>
                {branches.map((b) => (
                    <option key={`${b.isRemote ? 'r' : 'l'}:${b.name}`} value={b.name}>
                        {b.isCurrent ? `★ ${b.name}` : b.name}
                    </option>
                ))}
            </select>

            <input
                type="text"
                className="graph-filter-input"
                value={filters.authors?.[0] ?? ''}
                placeholder="Author"
                aria-label="Filter by author"
                onChange={(e) => onFiltersChange({
                    authors: e.currentTarget.value ? [e.currentTarget.value] : undefined,
                })}
            />

            <input
                type="text"
                className="graph-filter-input"
                value={filters.path ?? ''}
                placeholder="Path"
                aria-label="Filter by path"
                onChange={(e) => onFiltersChange({ path: e.currentTarget.value || undefined })}
            />

            <button
                type="button"
                className="graph-toolbar-btn"
                title="Refresh"
                aria-label="Refresh"
                aria-busy={refreshing ? 'true' : undefined}
                disabled={refreshing}
                onClick={onRefresh}
            >
                <i className={`codicon ${refreshing ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} aria-hidden="true" />
            </button>
        </div>
    );
}
