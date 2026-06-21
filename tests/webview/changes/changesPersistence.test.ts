import { describe, expect, it } from 'vitest';
import { changesStateToPersisted, readChangesStatePreferences } from '@webview/features/changes/changesPersistence';
import { createInitialChangesState, ChangesViewMode, ChangesSortMode } from '@webview/features/changes/changesState';
import { ChangeSectionId } from '@webview/features/changes/changeTree';

describe('changesPersistence', () => {
    it('reads only valid persisted preferences', () => {
        expect(readChangesStatePreferences({
            viewMode: 'list',
            sortMode: 'name',
            pathFilter: 'src',
            collapsedSectionIds: ['staged', 'bad'],
            commitMessageHistory: ['feat: one'],
        })).toEqual({
            viewMode: ChangesViewMode.List,
            sortMode: ChangesSortMode.Name,
            pathFilter: 'src',
            collapsedSectionIds: undefined,
            commitMessageHistory: ['feat: one'],
        });
    });

    it('serializes only persistent view preferences', () => {
        const state = createInitialChangesState({
            viewMode: ChangesViewMode.List,
            sortMode: ChangesSortMode.Extension,
            pathFilter: 'README',
            collapsedSectionIds: [ChangeSectionId.Unstaged],
            commitMessageHistory: ['fix: bug'],
        });

        expect(changesStateToPersisted(state)).toEqual({
            viewMode: ChangesViewMode.List,
            sortMode: ChangesSortMode.Extension,
            pathFilter: 'README',
            collapsedSectionIds: [ChangeSectionId.Unstaged],
            commitMessageHistory: ['fix: bug'],
        });
    });
});
