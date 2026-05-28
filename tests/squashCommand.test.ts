import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitCommitInfo } from '../src/gitService';
import { CommitItem } from '../src/commitItem';
import { handleSquash } from '../src/commands/squash';
import { resetVscodeMock } from './helpers/providerRuntime';

describe('squash command', () => {
    beforeEach(resetVscodeMock);

    function commit(hash: string, message: string): GitCommitInfo {
        return {
            hash,
            shortHash: hash.substring(0, 7),
            message,
            authorName: 'Author',
            authorEmail: 'author@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
        };
    }

    it('asks for and passes the squash message to the git service', async () => {
        const newest = commit('2222222222222222222222222222222222222222', 'newest selected');
        const oldest = commit('1111111111111111111111111111111111111111', 'oldest selected');
        const service = {
            getLog: vi.fn(async () => [newest, oldest]),
            getCurrentBranch: vi.fn(async () => 'main'),
            getHeadCommitHashes: vi.fn(async () => [newest.hash, oldest.hash]),
            hasUncommittedChanges: vi.fn(async () => false),
            isAncestorOfHead: vi.fn(async () => true),
            squashCommits: vi.fn(async () => ''),
        };
        const historyProvider = { refresh: vi.fn() };
        (vscode.window as any).warningChoice = 'Yes';
        (vscode.window as any).inputBoxValue = 'custom squash message';

        await handleSquash(
            service as any,
            historyProvider as any,
            undefined,
            [new CommitItem(newest, false), new CommitItem(oldest, false)],
        );

        expect(service.squashCommits).toHaveBeenCalledWith(
            oldest.hash,
            [newest.hash],
            'custom squash message',
        );
        expect(historyProvider.refresh).toHaveBeenCalledOnce();
    });

    it('cancels the squash when the message input is dismissed', async () => {
        const newest = commit('2222222222222222222222222222222222222222', 'newest selected');
        const oldest = commit('1111111111111111111111111111111111111111', 'oldest selected');
        const service = {
            getLog: vi.fn(async () => [newest, oldest]),
            getCurrentBranch: vi.fn(async () => 'main'),
            getHeadCommitHashes: vi.fn(async () => [newest.hash, oldest.hash]),
            hasUncommittedChanges: vi.fn(async () => false),
            isAncestorOfHead: vi.fn(async () => true),
            squashCommits: vi.fn(async () => ''),
        };
        const historyProvider = { refresh: vi.fn() };
        (vscode.window as any).warningChoice = 'Yes';
        (vscode.window as any).inputBoxValue = undefined;

        await handleSquash(
            service as any,
            historyProvider as any,
            undefined,
            [new CommitItem(newest, false), new CommitItem(oldest, false)],
        );

        expect(service.hasUncommittedChanges).not.toHaveBeenCalled();
        expect(service.squashCommits).not.toHaveBeenCalled();
        expect(historyProvider.refresh).not.toHaveBeenCalled();
    });
});
