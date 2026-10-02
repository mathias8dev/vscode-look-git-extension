import { afterEach, describe, expect, it } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { queryRegisteredSubmodulePaths, querySubmoduleStatus } from '@extension/git/queries/query-submodules';
import { createSubmoduleFixture, createTempGitRepo } from '@tests/helpers/git-repo';

describe('querySubmoduleStatus', () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        while (cleanups.length) { cleanups.pop()!(); }
    });

    it('returns registered submodules when the index also contains an unregistered gitlink', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        const commit = fixture.parent.gitTrim(['rev-parse', 'HEAD']);
        fixture.parent.git([
            'update-index',
            '--add',
            '--cacheinfo',
            `160000,${commit},.worktrees/push-destination-ownership`,
        ]);
        const git = new GitCliBackend(fixture.parent.cwd);

        await expect(querySubmoduleStatus((args, signal) => git.run(args, { signal }))).resolves.toEqual([
            { path: fixture.subPath, status: ' ' },
        ]);
    });

    it('returns no registered paths when git config reports no values', async () => {
        const noValueError = Object.assign(new Error('No submodule configuration.'), { code: 1 });

        await expect(queryRegisteredSubmodulePaths(async () => { throw noValueError; })).resolves.toEqual([]);
    });

    it('propagates cancellation and git configuration errors', async () => {
        const abortError = new Error('Cancelled.');
        abortError.name = 'AbortError';
        const configError = Object.assign(new Error('Malformed .gitmodules.'), { code: 3 });

        await expect(queryRegisteredSubmodulePaths(async () => { throw abortError; })).rejects.toBe(abortError);
        await expect(queryRegisteredSubmodulePaths(async () => { throw configError; })).rejects.toBe(configError);
    });

    it('initializes nested submodules when a recursive update is requested through the runtime', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        const grandchild = createTempGitRepo();
        cleanups.push(grandchild.cleanup);
        grandchild.commitFile('nested.txt', 'nested content\n', 'initialize nested repo');
        fixture.parent.git(['-C', fixture.subPath, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', grandchild.cwd, 'nested']);
        fixture.parent.git(['-C', fixture.subPath, 'commit', '-qm', 'add nested submodule']);
        fixture.parent.commit('advance child gitlink');
        fixture.parent.git(['submodule', 'deinit', '-f', '--', fixture.subPath]);
        const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
        const repository = new RuntimeRepositoryFactory(runtime).createRepository(createRepoContext(fixture.parent.cwd));

        await repository.updateSubmodule(fixture.subPath, { init: true, recursive: true });

        expect(fixture.parent.gitTrim(['submodule', 'status', '--recursive']).split('\n').every((line) => !line.startsWith('-'))).toBe(true);
        expect(fixture.parent.gitTrim(['-C', `${fixture.subPath}/nested`, 'show', 'HEAD:nested.txt'])).toBe('nested content');
    });

    it('does not initialize a submodule when init is false', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        fixture.parent.git(['submodule', 'deinit', '-f', '--', fixture.subPath]);
        const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
        const repository = new RuntimeRepositoryFactory(runtime).createRepository(createRepoContext(fixture.parent.cwd));

        await repository.updateSubmodule(fixture.subPath, { init: false });

        expect(fixture.parent.gitTrim(['submodule', 'status']).startsWith('-')).toBe(true);
    });

    it('updates to the remote branch rather than the recorded gitlink when remote is true', async () => {
        const fixture = createSubmoduleFixture();
        cleanups.push(fixture.cleanup);
        const source = fixture.parent.gitTrim(['-C', fixture.subPath, 'remote', 'get-url', 'origin']);
        fixture.parent.git(['-C', source, 'commit', '--allow-empty', '-qm', 'advance remote child']);
        const remoteHead = fixture.parent.gitTrim(['-C', source, 'rev-parse', 'HEAD']);
        const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
        const repository = new RuntimeRepositoryFactory(runtime).createRepository(createRepoContext(fixture.parent.cwd));

        await repository.updateSubmodule(fixture.subPath, { remote: true });

        expect(fixture.parent.gitTrim(['-C', fixture.subPath, 'rev-parse', 'HEAD'])).toBe(remoteHead);
    });
});
