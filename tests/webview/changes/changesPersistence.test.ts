import { describe, expect, it } from 'vitest';
import { changesStateToPersisted, readChangesStatePreferences } from '../../../src/webview/features/changes/changesPersistence';
import { createInitialChangesState } from '../../../src/webview/features/changes/changesState';

describe('changesPersistence', () => {
    it('reads only valid persisted preferences', () => {
        expect(readChangesStatePreferences({
            viewMode: 'list',
            sortMode: 'directory',
            pathFilter: 'src',
            collapsedSectionIds: ['staged', 'bad'],
            commitMessageHistory: ['feat: one'],
        })).toEqual({
            viewMode: 'list',
            sortMode: 'directory',
            pathFilter: 'src',
            collapsedSectionIds: undefined,
            commitMessageHistory: ['feat: one'],
        });
    });

    it('serializes only persistent view preferences', () => {
        const state = createInitialChangesState({
            viewMode: 'list',
            sortMode: 'status',
            pathFilter: 'README',
            collapsedSectionIds: ['unstaged'],
            commitMessageHistory: ['fix: bug'],
        });

        expect(changesStateToPersisted(state)).toEqual({
            viewMode: 'list',
            sortMode: 'status',
            pathFilter: 'README',
            collapsedSectionIds: ['unstaged'],
            commitMessageHistory: ['fix: bug'],
        });
    });
});
