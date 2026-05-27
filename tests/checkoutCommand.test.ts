import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitCommitInfo } from '../src/gitService';
import { handleCheckout } from '../src/commands/checkout';
import { CommitItem } from '../src/commitItem';
import { resetVscodeMock } from './helpers/providerRuntime';

describe('checkout commit command semantics', () => {
    beforeEach(resetVscodeMock);

    function commit(refs: string[] = []): GitCommitInfo & { refs?: string[] } {
        return {
            hash: 'abc1234567890abcdef1234567890abcdef1234',
            shortHash: 'abc1234',
            message: 'checkout target',
            authorName: 'Author',
            authorEmail: 'author@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
            refs,
        };
    }

    it('detaches HEAD directly for a local commit and never opens Changes or SCM', async () => {
        const target = commit(['main']);
        const service = {
            checkoutDetached: vi.fn(async () => ''),
            checkout: vi.fn(async () => ''),
            checkoutNewBranch: vi.fn(async () => ''),
        };
        const historyProvider = { refresh: vi.fn() };

        (vscode.window as any).quickPickValue = { action: 'branch' };
        (vscode.window as any).inputBoxValue = 'unexpected-branch';

        await handleCheckout(service as any, historyProvider as any, new CommitItem(target, false));

        expect(service.checkoutDetached).toHaveBeenCalledWith(target.hash);
        expect(service.checkout).not.toHaveBeenCalled();
        expect(service.checkoutNewBranch).not.toHaveBeenCalled();
        expect(historyProvider.refresh).toHaveBeenCalledOnce();
        expect((vscode.commands as any).calls).toEqual([]);
        expect((vscode.window as any).infoMessages).toContainEqual('Checked out abc1234 in detached HEAD state.');
    });

    it('uses the same detached checkout semantics for a commit shown on a remote ref', async () => {
        const target = commit(['origin/main']);
        const service = {
            checkoutDetached: vi.fn(async () => ''),
            checkout: vi.fn(async () => ''),
            checkoutNewBranch: vi.fn(async () => ''),
        };
        const historyProvider = { refresh: vi.fn() };

        await handleCheckout(service as any, historyProvider as any, new CommitItem(target, false));

        expect(service.checkoutDetached).toHaveBeenCalledWith(target.hash);
        expect(service.checkout).not.toHaveBeenCalled();
        expect(service.checkoutNewBranch).not.toHaveBeenCalled();
        expect((vscode.commands as any).calls).toEqual([]);
    });

    it('uses a coordinated repository refresh after detached checkout when provided', async () => {
        const target = commit(['main']);
        const service = {
            checkoutDetached: vi.fn(async () => ''),
            checkout: vi.fn(async () => ''),
            checkoutNewBranch: vi.fn(async () => ''),
        };
        const historyProvider = { refresh: vi.fn() };
        const refreshRepositoryViews = vi.fn(async () => undefined);

        await handleCheckout(
            service as any,
            historyProvider as any,
            new CommitItem(target, false),
            refreshRepositoryViews,
        );

        expect(service.checkoutDetached).toHaveBeenCalledWith(target.hash);
        expect(refreshRepositoryViews).toHaveBeenCalledOnce();
        expect(historyProvider.refresh).not.toHaveBeenCalled();
    });
});
