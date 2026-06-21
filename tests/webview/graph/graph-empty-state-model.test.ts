import { describe, expect, it } from 'vitest';
import { graphEmptyStateModel, hasActiveGraphFilters } from '@webview/features/graph/graph-empty-state-model';

describe('graphEmptyStateModel', () => {
    it('shows a first-commit empty state for an unfiltered main repository', () => {
        expect(graphEmptyStateModel({
            filters: {},
            selectedBranchFilter: undefined,
            selectedRepository: { kind: 'main' },
        })).toEqual({
            title: 'No commits yet',
            subtitle: 'Create the initial commit from the Changes panel.',
        });
    });

    it('shows a filtered empty state when any graph filter is active', () => {
        expect(graphEmptyStateModel({
            filters: { search: 'oauth' },
            selectedBranchFilter: undefined,
            selectedRepository: { kind: 'main' },
        })).toEqual({
            title: 'No matching commits',
            subtitle: 'Try clearing one or more active filters.',
            actionLabel: 'Clear filters',
        });
        expect(hasActiveGraphFilters({}, 'feature/login')).toBe(true);
    });

    it('uses submodule wording for empty scoped histories', () => {
        expect(graphEmptyStateModel({
            filters: {},
            selectedBranchFilter: undefined,
            selectedRepository: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
        }).title).toBe('No commits in this submodule yet');
    });
});
