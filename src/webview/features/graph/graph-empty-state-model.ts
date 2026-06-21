import type { GraphFilters } from '@protocol/graph/types';
import type { GraphRepositorySelection } from '@webview/features/graph/graph-repository-selection';

export interface GraphEmptyStateModel {
    readonly title: string;
    readonly subtitle: string;
    readonly actionLabel?: string;
}

export interface GraphEmptyStateInput {
    readonly filters: GraphFilters;
    readonly selectedBranchFilter: string | undefined;
    readonly selectedRepository: GraphRepositorySelection;
}

export function graphEmptyStateModel(input: GraphEmptyStateInput): GraphEmptyStateModel {
    if (hasActiveGraphFilters(input.filters, input.selectedBranchFilter)) {
        return {
            title: 'No matching commits',
            subtitle: 'Try clearing one or more active filters.',
            actionLabel: 'Clear filters',
        };
    }

    if (input.selectedRepository.kind === 'submodule') {
        return {
            title: 'No commits in this submodule yet',
            subtitle: 'Create the initial commit from the submodule changes.',
        };
    }

    return {
        title: 'No commits yet',
        subtitle: 'Create the initial commit from the Changes panel.',
    };
}

export function hasActiveGraphFilters(filters: GraphFilters, selectedBranchFilter: string | undefined): boolean {
    return Boolean(
        filters.search?.trim()
        || filters.path?.trim()
        || selectedBranchFilter
        || filters.branches?.length
        || filters.authors?.some((author) => author.trim().length > 0)
        || filters.dateFrom
        || filters.dateTo,
    );
}
