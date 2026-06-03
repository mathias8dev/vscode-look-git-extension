import { describe, expect, it, vi } from 'vitest';
import { CheckoutBranchUseCase } from '../../../../src/application/usecases/branches/checkout-branch';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('CheckoutBranchUseCase', () => {
    it('checks out local branches directly', async () => {
        const repo = makeRepositoryMock();

        await new CheckoutBranchUseCase().execute(repo, { branch: 'feature/local', isRemote: false });

        expect(repo.checkout).toHaveBeenCalledWith('feature/local');
        expect(repo.exec).not.toHaveBeenCalled();
    });

    it('checks out an existing local branch that already tracks the remote branch', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'feature/local\0origin/feature/local\n'),
        });

        await new CheckoutBranchUseCase().execute(repo, { branch: 'origin/feature/local', isRemote: true });

        expect(repo.checkout).toHaveBeenCalledWith('feature/local');
        expect(repo.exec).not.toHaveBeenCalled();
    });

    it('creates a tracking checkout when no local branch tracks the remote branch', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'main\0origin/main\n'),
        });

        await new CheckoutBranchUseCase().execute(repo, { branch: 'origin/feature/new', isRemote: true });

        expect(repo.checkout).not.toHaveBeenCalled();
        expect(repo.exec).toHaveBeenCalledWith(['checkout', '--track', 'origin/feature/new']);
    });
});
