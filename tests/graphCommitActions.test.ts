import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { GitCommitInfo } from '../src/gitService';
import { CommitItem } from '../src/commitItem';
import { handleCreatePatch } from '../src/commands/graphCommitActions';
import { resetVscodeMock } from './helpers/providerRuntime';

describe('graph commit actions', () => {
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

    it('creates a single patch file containing all selected commits', async () => {
        const newest = commit('2222222222222222222222222222222222222222', 'newest selected');
        const oldest = commit('1111111111111111111111111111111111111111', 'oldest selected');
        const service = {
            getWorkingDirectory: vi.fn(() => '/repo'),
            createPatch: vi.fn(async (hash: string) => `patch ${hash.substring(0, 7)}\n`),
        };
        const target = vscode.Uri.file('/repo/selected.patch');
        (vscode.window as any).saveDialogValue = target;

        await handleCreatePatch(
            service as any,
            new CommitItem(newest, false),
            [new CommitItem(newest, false), new CommitItem(oldest, false)],
        );

        expect(service.createPatch.mock.calls.map(([hash]) => hash)).toEqual([
            oldest.hash,
            newest.hash,
        ]);
        const writes = (vscode.workspace as any).fs.writes;
        expect(writes).toHaveLength(1);
        expect(writes[0].uri).toBe(target);
        expect(Buffer.from(writes[0].content).toString('utf8')).toBe(
            `patch ${oldest.shortHash}\n\npatch ${newest.shortHash}\n`,
        );
        expect((vscode.window as any).infoMessages).toContainEqual('Patches created: selected.patch');
    });
});
