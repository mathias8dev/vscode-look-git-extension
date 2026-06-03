import { describe, expect, it, vi } from 'vitest';
import { orderSelectedCommits } from '../../../../src/application/usecases/commits/order-selected-commits';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('orderSelectedCommits', () => {
    it('uses git topological order and preserves missing selected hashes at the end', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async () => 'newer\nolder\n'),
        });

        await expect(orderSelectedCommits(repo, ['older', 'missing', 'newer'], 'newestFirst')).resolves.toEqual(['newer', 'older', 'missing']);
        await expect(orderSelectedCommits(repo, ['older', 'missing', 'newer'], 'oldestFirst')).resolves.toEqual(['missing', 'older', 'newer']);

        expect(repo.exec).toHaveBeenCalledWith(['rev-list', '--topo-order', 'older', 'missing', 'newer']);
    });

    it('does not ask git to order one or zero commits', async () => {
        const repo = makeRepositoryMock();

        await expect(orderSelectedCommits(repo, ['only'], 'oldestFirst')).resolves.toEqual(['only']);
        await expect(orderSelectedCommits(repo, [], 'oldestFirst')).resolves.toEqual([]);

        expect(repo.exec).not.toHaveBeenCalled();
    });
});
