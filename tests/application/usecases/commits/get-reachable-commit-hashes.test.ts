import { describe, expect, it, vi } from 'vitest';
import { getReachableCommitHashes } from '../../../../src/application/usecases/commits/get-reachable-commit-hashes';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('getReachableCommitHashes', () => {
    it('returns selected hashes that are reachable from HEAD', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'topic\n'),
        });

        const reachable = await getReachableCommitHashes(repo, ['main', 'topic']);

        expect(Array.from(reachable)).toEqual(['main']);
        expect(repo.execRaw).toHaveBeenCalledWith(['rev-list', '--no-walk', 'main', 'topic', '--not', 'HEAD'], undefined);
    });

    it('deduplicates hashes before asking git', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => ''),
        });

        const reachable = await getReachableCommitHashes(repo, ['main', 'topic', 'main']);

        expect(Array.from(reachable)).toEqual(['main', 'topic']);
        expect(repo.execRaw).toHaveBeenCalledWith(['rev-list', '--no-walk', 'main', 'topic', '--not', 'HEAD'], undefined);
    });

    it('matches abbreviated input hashes against full git output', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => '1234567890abcdef1234567890abcdef12345678\n'),
        });

        const reachable = await getReachableCommitHashes(repo, ['1234567']);

        expect(Array.from(reachable)).toEqual([]);
    });

    it('ignores unreachable ancestors that were not selected', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'topic-head\ntopic-parent\n'),
        });

        const reachable = await getReachableCommitHashes(repo, ['main', 'topic-head']);

        expect(Array.from(reachable)).toEqual(['main']);
    });

    it('does not ask git for empty input', async () => {
        const repo = makeRepositoryMock();

        const reachable = await getReachableCommitHashes(repo, []);

        expect(Array.from(reachable)).toEqual([]);
        expect(repo.execRaw).not.toHaveBeenCalled();
    });
});
