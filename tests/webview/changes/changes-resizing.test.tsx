// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictState, RepositoryState, type StatusData } from '@protocol/changes/types';
import { SubmoduleStatus } from '@protocol/shared/repo';
import { createMockVsCodeApi, sendToWebview } from '@tests/helpers/webview-runtime';

const status: StatusData = {
    repositoryState: RepositoryState.Available, currentBranch: 'main', conflictState: ConflictState.Merge,
    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/unstaged.ts' }],
    conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
    stashes: [{ index: 0, message: 'WIP' }],
    submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
};

describe('Changes resizable lists', () => {
    beforeEach(() => { vi.resetModules(); localStorage.clear(); });
    const mount = async () => {
        createMockVsCodeApi();
        const { ChangesWebview } = await import('@webview/changes/changes-webview');
        render(<ChangesWebview />);
        act(() => sendToWebview({ type: 'changes/statusData', data: status }));
    };

    it('exposes independent keyboard-resizable lists and removes handles for collapsed or empty sections', async () => {
        await mount();
        for (const title of ['Staged', 'Changes', 'Conflicts', 'Stashes', 'Submodules']) {
            expect(screen.getByRole('separator', { name: `Resize ${title} list` })).toHaveAttribute('aria-orientation', 'horizontal');
        }
        const staged = screen.getByRole('separator', { name: 'Resize Staged list' });
        fireEvent.keyDown(staged, { key: 'ArrowDown' });
        expect(localStorage.getItem('lookGit.changes.staged.maxHeight')).toBe('256');
        expect(screen.getByRole('separator', { name: 'Resize Changes list' })).toHaveAttribute('aria-valuenow', '240');
        fireEvent.keyDown(staged, { key: 'Home' });
        expect(staged).toHaveAttribute('aria-valuenow', '48');
        fireEvent.keyDown(staged, { key: 'End' });
        expect(staged).toHaveAttribute('aria-valuenow', '900');
        fireEvent.click(screen.getByRole('heading', { name: 'Staged' }));
        expect(screen.queryByRole('separator', { name: 'Resize Staged list' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('heading', { name: 'Staged' }));
        expect(screen.getByRole('separator', { name: 'Resize Staged list' })).toHaveAttribute('aria-valuenow', '900');
        fireEvent.click(screen.getByRole('heading', { name: 'Stashes' }));
        expect(screen.queryByRole('separator', { name: 'Resize Stashes list' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse submodules' }));
        expect(screen.queryByRole('separator', { name: 'Resize Submodules list' })).not.toBeInTheDocument();
        act(() => sendToWebview({ type: 'changes/statusData', data: { ...status, staged: [], unstaged: [], conflicts: [], stashes: [], submodules: [], conflictState: ConflictState.None } }));
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    it('starts dragging from the rendered height of a short list and restores its saved limit after reopening', async () => {
        await mount();
        const content = screen.getByTitle('src/staged.ts').closest('.changes-resizable-list');
        if (!(content instanceof HTMLElement)) { throw new Error('Expected resizable staged list.'); }
        expect(content.style.height).toBe('');
        expect(content.style.maxHeight).toBe('240px');
        vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 128));
        const separator = screen.getByRole('separator', { name: 'Resize Staged list' });
        fireEvent.pointerDown(separator, { pointerId: 1, clientY: 100 });
        fireEvent.pointerMove(separator, { pointerId: 1, clientY: 140 });
        fireEvent.pointerUp(separator, { pointerId: 1, clientY: 140 });
        expect(content.style.height).toBe('168px');
        expect(localStorage.getItem('lookGit.changes.staged.maxHeight')).toBe('168');
        fireEvent.click(screen.getByRole('heading', { name: 'Staged' }));
        fireEvent.click(screen.getByRole('heading', { name: 'Staged' }));
        expect(screen.getByTitle('src/staged.ts').closest('.changes-resizable-list')).toHaveStyle({ maxHeight: '168px' });
    });
});
