import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CommitHistoryViewProvider } from '../../../src/extension/views/CommitHistoryViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';

describe('CommitHistoryViewProvider error propagation', () => {
    beforeEach(resetVscodeMock);

    it('posts mapped commit history data on refresh', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => [{
                hash: 'abc123456789',
                shortHash: 'abc1234',
                message: 'feat: history',
                authorName: 'Ada',
                authorEmail: 'ada@example.com',
                authorDate: '2024-01-01T00:00:00Z',
                parentHashes: [],
            }]),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'history/data',
            commits: [{
                hash: 'abc123456789',
                shortHash: 'abc1234',
                message: 'feat: history',
                authorName: 'Ada',
                authorDate: '2024-01-01T00:00:00Z',
            }],
        }));
    });

    it('posts an empty history payload when no repository is active', async () => {
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(undefined));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'history/data',
            commits: [],
        }));
    });

    it('posts a protocol error when history refresh fails', async () => {
        const repo = makeRepositoryMock({
            getLog: vi.fn(async () => { throw new Error('history failed'); }),
        });
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo));
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'history/error',
            message: 'history failed',
            error: expect.objectContaining({
                code: 'refreshFailed',
                operation: 'history/refresh',
                recoverable: true,
            }),
        })));
    });
});
