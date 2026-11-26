import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { createRemoteWorkflowFixture, type RemoteWorkflowFixture } from '@tests/helpers/git-repo';

describe('fetch pruning against real remote repositories', () => {
    const fixtures: RemoteWorkflowFixture[] = [];
    afterEach(() => { fixtures.splice(0).forEach(fixture => fixture.cleanup()); });

    function setup() {
        const fixture = createRemoteWorkflowFixture();
        fixtures.push(fixture);
        fixture.local.git(['config', 'fetch.prune', 'false']);
        fixture.local.git(['config', 'fetch.pruneTags', 'false']);
        const repository = new RuntimeGitRepository({
            repoId: fixture.local.cwd, cwd: fixture.local.cwd, gitDir: path.join(fixture.local.cwd, '.git'), kind: 'main', label: 'Fetch pruning',
        });
        return { ...fixture, repository };
    }

    it.each(['fetch', 'fetchAll'] as const)('%s removes deleted remote branches while preserving local branches, tags and changes', async operation => {
        const { local, remote, repository } = setup();
        const head = local.gitTrim(['rev-parse', 'HEAD']);
        const feature = local.gitTrim(['rev-parse', 'origin/feature/nested']);
        local.git(['branch', 'feature/nested', feature]);
        local.git(['tag', 'local-only-tag']);
        local.write('draft.txt', 'uncommitted work\n');
        const status = local.git(['status', '--porcelain']);
        remote.git(['update-ref', '-d', 'refs/heads/feature/nested']);

        expect((await repository.listBranches()).some(branch => branch.name === 'origin/feature/nested')).toBe(true);
        if (operation === 'fetch') { await repository.fetch('origin', {}); }
        else { await repository.fetchAll({}); }

        expect((await repository.listBranches()).some(branch => branch.name === 'origin/feature/nested')).toBe(false);
        expect(local.gitTrim(['rev-parse', 'refs/heads/feature/nested'])).toBe(feature);
        expect(local.gitTrim(['rev-parse', 'refs/tags/local-only-tag'])).toBe(head);
        expect(local.gitTrim(['rev-parse', 'HEAD'])).toBe(head);
        expect(local.git(['status', '--porcelain'])).toBe(status);
        expect(local.gitTrim(['config', 'fetch.prune'])).toBe('false');
    });

    it('prunes only the selected remote and fetch all prunes each configured remote', async () => {
        const { local, remote, repository } = setup();
        local.git(['remote', 'rename', 'origin', 'upstream']);
        local.git(['remote', 'add', 'backup', remote.cwd]);
        local.git(['fetch', 'backup']);
        remote.git(['update-ref', '-d', 'refs/heads/feature/nested']);

        await repository.fetch('upstream', {});
        let names = (await repository.listBranches()).map(branch => branch.name);
        expect(names).not.toContain('upstream/feature/nested');
        expect(names).toContain('backup/feature/nested');
        await repository.fetchAll({});
        names = (await repository.listBranches()).map(branch => branch.name);
        expect(names).not.toContain('backup/feature/nested');
        expect(names).toContain('main');
    });

    it.each(['fetch', 'fetchAll'] as const)('%s respects an explicit request to disable pruning', async operation => {
        const { local, remote, repository } = setup();
        local.git(['config', 'fetch.prune', 'true']);
        remote.git(['update-ref', '-d', 'refs/heads/feature/nested']);

        if (operation === 'fetch') { await repository.fetch('origin', { prune: false }); }
        else { await repository.fetchAll({ prune: false }); }

        expect((await repository.listBranches()).some(branch => branch.name === 'origin/feature/nested')).toBe(true);
    });

    it('does not prune when a fetch is cancelled', async () => {
        const { remote, repository } = setup();
        remote.git(['update-ref', '-d', 'refs/heads/feature/nested']);
        const controller = new AbortController();
        controller.abort();

        await expect(repository.fetchAll({}, controller.signal)).rejects.toThrow();
        expect((await repository.listBranches()).some(branch => branch.name === 'origin/feature/nested')).toBe(true);
    });
});
