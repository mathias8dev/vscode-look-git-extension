import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import * as vscode from 'vscode';
import { GitRootRepositoryResolver } from '../../../src/extension/repositories/GitRepositoryResolver';
import { makeRepositoryMock } from '../../helpers/repositoryMock';

describe('GitRootRepositoryResolver', () => {
    it('reuses the active repository when the clicked file belongs to its root', async () => {
        const root = path.resolve('workspace');
        const filePath = path.join(root, 'src', 'app.ts');
        const probeRoot = path.dirname(filePath);
        const activeRepo = makeRepositoryMock({ cwd: root });
        const probeRepo = makeRepositoryMock({
            cwd: probeRoot,
            exec: vi.fn(async () => root),
        });
        const repositoryForRoot = vi.fn((cwd: string) => {
            if (cwd === probeRoot) { return probeRepo; }
            throw new Error(`Unexpected repository cwd: ${cwd}`);
        });
        const resolver = new GitRootRepositoryResolver({
            currentRepository: activeRepo,
            currentContext: undefined,
            requireRepository: () => activeRepo,
            repositoryForRoot,
        });

        await expect(resolver.repositoryForUri(vscode.Uri.file(filePath))).resolves.toBe(activeRepo);

        expect(probeRepo.exec).toHaveBeenCalledWith(['rev-parse', '--show-toplevel']);
        expect(repositoryForRoot).toHaveBeenCalledTimes(1);
    });

    it('creates a repository for the clicked file root when it is not the active repository', async () => {
        const activeRoot = path.resolve('workspace-a');
        const clickedRoot = path.resolve('workspace-b');
        const filePath = path.join(clickedRoot, 'src', 'app.ts');
        const probeRoot = path.dirname(filePath);
        const activeRepo = makeRepositoryMock({ cwd: activeRoot });
        const probeRepo = makeRepositoryMock({
            cwd: probeRoot,
            exec: vi.fn(async () => clickedRoot),
        });
        const clickedRepo = makeRepositoryMock({ cwd: clickedRoot });
        const repositoryForRoot = vi.fn((cwd: string) => {
            if (cwd === probeRoot) { return probeRepo; }
            if (cwd === clickedRoot) { return clickedRepo; }
            throw new Error(`Unexpected repository cwd: ${cwd}`);
        });
        const resolver = new GitRootRepositoryResolver({
            currentRepository: activeRepo,
            currentContext: undefined,
            requireRepository: () => activeRepo,
            repositoryForRoot,
        });

        await expect(resolver.repositoryForUri(vscode.Uri.file(filePath))).resolves.toBe(clickedRepo);

        expect(probeRepo.exec).toHaveBeenCalledWith(['rev-parse', '--show-toplevel']);
        expect(repositoryForRoot).toHaveBeenCalledWith(clickedRoot);
    });

    it('rejects non-file URIs', async () => {
        const resolver = new GitRootRepositoryResolver({
            currentRepository: undefined,
            currentContext: undefined,
            requireRepository: () => { throw new Error('No active Git repository.'); },
            repositoryForRoot: vi.fn(),
        });

        await expect(resolver.repositoryForUri(vscode.Uri.parse('untitled:/draft.ts'))).rejects.toThrow(
            'Look Git file actions are only available for local files.',
        );
    });
});
