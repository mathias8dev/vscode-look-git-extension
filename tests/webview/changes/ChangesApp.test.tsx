// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConflictState, RepositoryState } from '../../../src/protocol/changes/types';
import { ChangesApp } from '../../../src/webview/features/changes/ChangesApp';
import { createInitialChangesState } from '../../../src/webview/features/changes/changesState';
import { CreateStashKind } from '../../../src/webview/features/changes/stashCommands';

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

    it('offers a stash staged action from the staged section', () => {
        const onCreateStash = vi.fn<(kind: CreateStashKind, message: string) => void>();
        const state = {
            ...createInitialChangesState(),
            loading: false,
            status: {
                repositoryState: RepositoryState.Available,
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [],
                conflicts: [],
                conflictState: ConflictState.None,
                stashes: [],
                submodules: [],
            },
        };

        render(
            <ChangesApp
                state={state}
                onSectionToggle={() => undefined}
                onSelectItem={() => undefined}
                onRowAction={() => undefined}
                onBulkAction={() => undefined}
                onCommit={() => undefined}
                onOperationAction={() => undefined}
                onCreateStash={onCreateStash}
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

        fireEvent.click(screen.getByRole('button', { name: 'Stash staged changes' }));
        fireEvent.change(screen.getByLabelText('Stash message'), { target: { value: 'staged only' } });
        fireEvent.click(screen.getByRole('button', { name: 'Stash' }));

        expect(onCreateStash).toHaveBeenCalledWith(CreateStashKind.Staged, 'staged only');
    });
});
