import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConflictState, RepositoryState } from '../../../src/protocol/changes/types';
import { ChangesApp } from '../../../src/webview/features/changes/ChangesApp';
import { createInitialChangesState } from '../../../src/webview/features/changes/changesState';

describe('ChangesApp', () => {
    it('renders continue and abort controls while a merge is in progress', () => {
        const state = {
            ...createInitialChangesState(),
            loading: false,
            status: {
                repositoryState: RepositoryState.Available,
                staged: [],
                unstaged: [],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.txt' }],
                conflictState: ConflictState.Merge,
                stashes: [],
                submodules: [],
            },
        };

        const markup = renderToStaticMarkup(
            <ChangesApp
                state={state}
                onSectionToggle={() => undefined}
                onSelectItem={() => undefined}
                onRowAction={() => undefined}
                onBulkAction={() => undefined}
                onCommit={() => undefined}
                onOperationAction={() => undefined}
                onCreateStash={() => undefined}
                onToggleStash={() => undefined}
                onStashAction={() => undefined}
                onStashFileDiff={() => undefined}
                onSubmoduleAction={() => undefined}
                onToggleSubmodule={() => undefined}
                onSubmoduleRowAction={() => undefined}
                onSubmoduleBulkAction={() => undefined}
                onSubmoduleOperationAction={() => undefined}
                onSubmoduleCommit={() => undefined}
                onSubmoduleCreateStash={() => undefined}
                onToggleSubmoduleStash={() => undefined}
                onSubmoduleStashAction={() => undefined}
                onSubmoduleStashFileDiff={() => undefined}
            />,
        );

        expect(markup).toContain('Merge in progress');
        expect(markup).toContain('Continue');
        expect(markup).toContain('Abort');
        expect(markup).not.toContain('<h1>Changes</h1>');
        expect(markup).not.toContain('Refresh Changes');
    });
});
