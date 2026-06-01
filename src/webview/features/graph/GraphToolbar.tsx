import { useRef } from 'react';
import type { BranchInfo, GraphFilters } from '../../../protocol/graph/types';

interface GraphToolbarProps {
    readonly filters: GraphFilters;
    readonly branches: readonly BranchInfo[];
    readonly selectedBranchFilter: string | undefined;
    readonly onFiltersChange: (filters: Partial<GraphFilters>) => void;
    readonly onBranchFilterChange: (branch: string | undefined) => void;
    readonly onRefresh: () => void;
}

export function GraphToolbar({
    filters,
    branches,
    selectedBranchFilter,
    onFiltersChange,
    onBranchFilterChange,
    onRefresh,
}: GraphToolbarProps) {
    const searchRef = useRef<HTMLInputElement>(null);

    return (
        <div className="graph-toolbar">
            <div className="graph-toolbar-search">
                <i className="codicon codicon-search graph-search-icon" aria-hidden="true" />
                <input
                    ref={searchRef}
                    type="search"
                    className="graph-search-input"
                    value={filters.search ?? ''}
                    placeholder="Text or hash"
                    aria-label="Search commits"
                    onChange={(e) => onFiltersChange({ search: e.currentTarget.value || undefined })}
                />
            </div>

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
                onClick={onRefresh}
            >
                <i className="codicon codicon-refresh" aria-hidden="true" />
            </button>
        </div>
    );
}
