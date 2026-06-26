import { describe, expect, it } from 'vitest';
import { UnsupportedGitOperationError } from '@application/ports/git-runtime';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import type { GitExecutionContext } from '@application/ports/git-runtime';
import type { CliGitRuntimeProcess } from '@extension/git/cli-git-runtime';

const context = {
    cwd: '/repo',
    gitDir: '/repo/.git',
    repositoryId: 'repo',
    worktreeId: 'main',
    kind: 'main',
} satisfies GitExecutionContext;

describe('CliGitRuntime', () => {
    it('executes supported semantic actions as git invocations', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('stage', context, { paths: ['src/a.ts', 'src/b.ts'] });

        expect(calls).toEqual([['add', '--', 'src/a.ts', 'src/b.ts']]);
    });

    it('resolves conflicts by checking out one side and staging the paths', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('acceptOurs', context, { paths: ['src/a.ts'] });
        await runtime.execute('acceptTheirs', context, { paths: ['src/b.ts', 'src/c.ts'] });

        expect(calls).toEqual([
            ['checkout', '--ours', '--', 'src/a.ts'],
            ['add', '--', 'src/a.ts'],
            ['checkout', '--theirs', '--', 'src/b.ts', 'src/c.ts'],
            ['add', '--', 'src/b.ts', 'src/c.ts'],
        ]);
    });

    it('does not execute conflict side commands for an empty path selection', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('acceptTheirs', context, { paths: [] });

        expect(calls).toEqual([]);
    });

    it('returns semantic output for listRemotes and previewClean', async () => {
        const runtime = new CliGitRuntime(async (args) => {
            if (args[0] === 'remote') { return 'origin\nupstream\n'; }
            return 'Would remove tmp.txt\nWould remove build/out.js\n';
        });

        await expect(runtime.execute('listRemotes', context, undefined)).resolves.toEqual(['origin', 'upstream']);
        await expect(runtime.execute('previewClean', context, { paths: [] })).resolves.toEqual(['tmp.txt', 'build/out.js']);
    });

    it('pushes a branch to its upstream remote when no remote is provided', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            if (args.join(' ') === 'rev-parse --abbrev-ref main@{upstream}') { return 'upstream/main\n'; }
            return '';
        });

        await runtime.execute('pushBranch', context, { branch: 'main', options: {} });

        expect(calls).toEqual([
            ['rev-parse', '--abbrev-ref', 'main@{upstream}'],
            ['push', 'upstream', 'main'],
        ]);
    });

    it('publishes a branch to the first remote when no upstream exists', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            if (args[0] === 'rev-parse') { throw new Error('no upstream'); }
            if (args[0] === 'remote') { return 'origin\nupstream\n'; }
            return '';
        });

        await runtime.execute('pushBranch', context, { branch: 'feature/auth', options: { forceWithLease: true } });

        expect(calls).toEqual([
            ['rev-parse', '--abbrev-ref', 'feature/auth@{upstream}'],
            ['remote'],
            ['push', '-u', '--force-with-lease', 'origin', 'feature/auth'],
        ]);
    });

    it('publishes the current branch on push when it has no upstream', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') { return 'feature/auth\n'; }
            if (args.join(' ') === 'rev-parse --abbrev-ref feature/auth@{upstream}') { throw new Error('no upstream'); }
            if (args[0] === 'remote') { return 'origin\n'; }
            return '';
        });

        await runtime.execute('push', context, { options: {} });

        expect(calls).toEqual([
            ['rev-parse', '--abbrev-ref', 'HEAD'],
            ['rev-parse', '--abbrev-ref', 'feature/auth@{upstream}'],
            ['remote'],
            ['push', '-u', 'origin', 'feature/auth'],
        ]);
    });

    it('keeps plain push when the current branch has an upstream', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') { return 'main\n'; }
            if (args.join(' ') === 'rev-parse --abbrev-ref main@{upstream}') { return 'origin/main\n'; }
            return '';
        });

        await runtime.execute('push', context, { options: { forceWithLease: true } });

        expect(calls).toEqual([
            ['rev-parse', '--abbrev-ref', 'HEAD'],
            ['rev-parse', '--abbrev-ref', 'main@{upstream}'],
            ['push', '--force-with-lease'],
        ]);
    });

    it('returns typed status data from git status output', async () => {
        const runtime = new CliGitRuntime(async (args) => {
            if (args[0] === 'status') { return ' M file.txt\0'; }
            if (args[0] === 'submodule') { return ''; }
            throw new Error(`Unexpected args: ${args.join(' ')}`);
        });

        await expect(runtime.execute('getStatus', context, undefined)).resolves.toMatchObject({
            staged: [],
            unstaged: [{ filePath: 'file.txt', workTreeStatus: 'M' }],
            conflicts: [],
            conflictState: 'none',
        });
    });

    it('returns typed branch and tag data', async () => {
        const runtime = new CliGitRuntime(async (args) => {
            if (args[0] === 'for-each-ref') {
                return [
                    'refs/heads/main\0abc123\0origin/main\0[ahead 1, behind 2]',
                    'refs/remotes/origin/main\0def456\0\0',
                ].join('\n');
            }
            if (args[0] === 'rev-parse') { return 'main\n'; }
            if (args[0] === 'tag') { return 'v1.0.0\0abc123\n'; }
            throw new Error(`Unexpected args: ${args.join(' ')}`);
        });

        await expect(runtime.execute('listBranches', context, undefined)).resolves.toEqual([
            { name: 'main', isCurrent: true, hash: 'abc123', upstream: 'origin/main', ahead: 1, behind: 2, isRemote: false },
            { name: 'origin/main', isCurrent: false, hash: 'def456', upstream: undefined, ahead: 0, behind: 0, isRemote: true },
        ]);
        await expect(runtime.execute('listTags', context, undefined)).resolves.toEqual([
            { name: 'v1.0.0', hash: 'abc123' },
        ]);
    });

    it('returns typed worktree and submodule topology data', async () => {
        const runtime = new CliGitRuntime(async (args) => {
            if (args.join(' ') === 'worktree list --porcelain') {
                return 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-linked\nHEAD def456\ndetached\n';
            }
            if (args.join(' ') === 'submodule status') {
                return ' abc123 libs/one (heads/main)\n-ded456 libs/two\n';
            }
            throw new Error(`Unexpected args: ${args.join(' ')}`);
        });

        await expect(runtime.execute('listWorktrees', context, undefined)).resolves.toMatchObject([
            { path: '/repo', head: 'abc123', branch: 'refs/heads/main', isMain: true },
            { path: '/repo-linked', head: 'def456', branch: undefined, isDetached: true },
        ]);
        await expect(runtime.execute('listSubmodules', context, undefined)).resolves.toEqual([
            { path: 'libs/one', status: ' ' },
            { path: 'libs/two', status: '-' },
        ]);
    });

    it('pages stash results with the domain Page value', async () => {
        const runtime = new CliGitRuntime(async (args) => {
            if (args.join(' ') === 'stash list --format=%gd %s') {
                return 'stash@{0} first\nstash@{1} second\nstash@{2} third\n';
            }
            throw new Error(`Unexpected args: ${args.join(' ')}`);
        });

        await expect(runtime.execute('listStashes', context, { pageRequest: { limit: 2 } })).resolves.toMatchObject({
            items: [
                { index: 0, message: 'first' },
                { index: 1, message: 'second' },
            ],
            hasMore: true,
            encodedNextCursor: '2',
        });
    });

    it('returns typed stash files from stash refs', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            return 'M\0src/app.ts\0R100\0old.ts\0new.ts\0';
        });

        await expect(runtime.execute('getStashFiles', context, { stash: 'stash@{2}' })).resolves.toEqual([
            { status: 'M', filePath: 'src/app.ts', origPath: undefined, parentHash: undefined },
            { status: 'R', filePath: 'new.ts', origPath: 'old.ts', parentHash: undefined },
        ]);
        expect(calls).toEqual([
            ['stash', 'show', '--include-untracked', '--name-status', '-M', '-z', 'stash@{2}'],
        ]);
    });

    it('returns commit details semantic data', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            if (args.join(' ') === 'log -1 --format=%B abc123') {
                return 'feat: add details\n\nBody\n';
            }
            if (args.join(' ') === 'rev-list --parents -n 1 abc123') {
                return 'abc123 parent';
            }
            if (args.join(' ') === 'diff-tree --no-commit-id -r -M --name-status -z parent abc123') {
                return 'M\0src/app.ts\0';
            }
            if (args.join(' ') === 'diff-tree --no-commit-id -r --raw -z parent abc123') {
                return '';
            }
            throw new Error(`Unexpected args: ${args.join(' ')}`);
        });

        await expect(runtime.execute('getCommitMessage', context, { commit: 'abc123' })).resolves.toBe('feat: add details\n\nBody');
        await expect(runtime.execute('getCommitFiles', context, { commit: 'abc123' })).resolves.toEqual([
            { status: 'M', filePath: 'src/app.ts', origPath: undefined, parentHash: 'parent' },
        ]);
        expect(calls).toEqual([
            ['log', '-1', '--format=%B', 'abc123'],
            ['rev-list', '--parents', '-n', '1', 'abc123'],
            ['diff-tree', '--no-commit-id', '-r', '--raw', '-z', 'parent', 'abc123'],
            ['diff-tree', '--no-commit-id', '-r', '-M', '--name-status', '-z', 'parent', 'abc123'],
        ]);
    });

    it('executes worktree and submodule topology mutations through existing query helpers', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('addWorktree', context, { path: '/repo-feature', branch: 'feature/new', createNew: true, startPoint: 'origin/feature/new' });
        await runtime.execute('removeWorktree', context, { worktree: '/repo-feature', force: true });
        await runtime.execute('updateSubmodule', context, { path: 'libs/one' });

        expect(calls).toEqual([
            ['worktree', 'add', '-b', 'feature/new', '/repo-feature', 'origin/feature/new'],
            ['worktree', 'remove', '/repo-feature', '--force'],
            ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', 'libs/one'],
        ]);
    });

    it('preserves semantic stash options in git invocation args', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('stash', context, {
            message: 'staged work',
            options: { staged: true, includeUntracked: true, keepIndex: true, paths: ['src/a.ts', 'src/b.ts'] },
        });

        expect(calls).toEqual([
            ['stash', 'push', '--include-untracked', '--keep-index', '--staged', '-m', 'staged work', '--', 'src/a.ts', 'src/b.ts'],
        ]);
    });

    it('preserves semantic cherry-pick and revert options in git invocation args', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('cherryPick', context, { commit: 'abc123', options: { noCommit: true } });
        await runtime.execute('revertCommit', context, { commit: 'def456', options: { noCommit: true, noEdit: true } });

        expect(calls).toEqual([
            ['cherry-pick', '--no-commit', 'abc123'],
            ['revert', '--no-commit', '--no-edit', 'def456'],
        ]);
    });

    it('maps tag deletion input objects to git invocation args', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('deleteTag', context, { name: 'v1.2.3' });

        expect(calls).toEqual([
            ['tag', '-d', 'v1.2.3'],
        ]);
    });

    it('maps remote management input objects to git invocation args', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('addRemote', context, { name: 'upstream', url: 'git@example.test:org/repo.git' });
        await runtime.execute('removeRemote', context, 'upstream');

        expect(calls).toEqual([
            ['remote', 'add', 'upstream', 'git@example.test:org/repo.git'],
            ['remote', 'remove', 'upstream'],
        ]);
    });

    it('maps stash summary input objects to git invocation args', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('getStashSummary', context, { stash: 'stash@{4}' });

        expect(calls).toEqual([
            ['stash', 'show', '--include-untracked', '--stat', 'stash@{4}'],
        ]);
    });

    it('reads file content through semantic revision and index operations without trimming', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            return 'content\n\n';
        });

        await expect(runtime.execute('getFileAtRevision', context, { path: 'src/app.ts', revision: 'HEAD' })).resolves.toBe('content\n\n');
        await expect(runtime.execute('getFileFromIndex', context, { path: 'src/app.ts' })).resolves.toBe('content\n\n');

        expect(calls).toEqual([
            ['show', 'HEAD:src/app.ts'],
            ['show', ':src/app.ts'],
        ]);
    });

    it('reads conflict stage contents through one semantic runtime operation', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            if (args[0] === 'ls-files') {
                return [
                    `100644 ${'1'.repeat(40)} 1\tsrc/conflict.ts`,
                    `100644 ${'2'.repeat(40)} 2\tsrc/conflict.ts`,
                    `100644 ${'3'.repeat(40)} 3\tsrc/conflict.ts`,
                    '',
                ].join('\0');
            }
            return `${args.at(-1)}\n\n`;
        });

        await expect(runtime.execute('getConflictStages', context, { path: 'src/conflict.ts' })).resolves.toEqual({
            base: `${'1'.repeat(40)}\n\n`,
            ours: `${'2'.repeat(40)}\n\n`,
            theirs: `${'3'.repeat(40)}\n\n`,
        });

        expect(calls).toEqual([
            ['ls-files', '-u', '-z', '--', 'src/conflict.ts'],
            ['cat-file', '-p', '1'.repeat(40)],
            ['cat-file', '-p', '2'.repeat(40)],
            ['cat-file', '-p', '3'.repeat(40)],
        ]);
    });

    it('maps patch and diff operations to git invocations inside the CLI runtime', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(async (args) => {
            calls.push([...args]);
            return args.includes('--no-index') ? 'untracked patch\n' : 'patch\n';
        });

        await expect(runtime.execute('getIndexDiff', context, { paths: ['src/staged.ts'] })).resolves.toBe('patch\n');
        await expect(runtime.execute('getWorkingTreeDiff', context, { paths: ['src/app.ts'] })).resolves.toBe('patch\n');
        await expect(runtime.execute('getPatch', context, { scope: 'untracked', paths: ['src/new.ts'] })).resolves.toBe('untracked patch\n');
        await expect(runtime.execute('checkPatch', context, { patch: 'diff --git\n', options: { threeWay: true } })).resolves.toBe(true);
        await runtime.execute('applyPatchToIndex', context, { patch: 'diff --git\n', options: { threeWay: true } });

        expect(calls[0]).toEqual(['diff', '--cached', '--binary', '--', 'src/staged.ts']);
        expect(calls[1]).toEqual(['diff', '--binary', '--', 'src/app.ts']);
        expect(calls[2]).toEqual(['diff', '--binary', '--no-index', '--', '/dev/null', 'src/new.ts']);
        expect(calls[3]?.slice(0, -1)).toEqual(['apply', '--check', '--3way']);
        expect(calls[4]?.slice(0, -1)).toEqual(['apply', '--3way', '--index']);
        expect(calls[3]?.at(-1)).toMatch(/patch\.diff$/);
        expect(calls[4]?.at(-1)).toMatch(/patch\.diff$/);
    });

    it('maps detached worktree, keep reset, and ref push operations to git invocation args', async () => {
        const calls: string[][] = [];
        const runtime = new CliGitRuntime(recordingProcess(calls));

        await runtime.execute('addDetachedWorktree', context, { path: '/tmp/revision', ref: 'abc123' });
        await runtime.execute('resetKeep', context, 'abc123');
        await runtime.execute('pushRef', context, { remote: 'origin', sourceRef: 'abc123', destinationRef: 'refs/heads/main' });
        await runtime.execute('pushTags', context, { remote: 'origin', options: {} });

        expect(calls).toEqual([
            ['worktree', 'add', '--detach', '/tmp/revision', 'abc123'],
            ['reset', '--keep', 'abc123'],
            ['push', 'origin', 'abc123:refs/heads/main'],
            ['push', 'origin', '--tags'],
        ]);
    });

    it('executes fixup commits as a semantic runtime operation with scoped editor environment', async () => {
        const calls: { readonly args: readonly string[]; readonly env?: Readonly<Record<string, string>> }[] = [];
        const runtime = new CliGitRuntime(async (args, _context, options) => {
            calls.push({ args: [...args], env: options.env });
            if (args.join(' ') === 'diff --cached --name-only') { return 'src/app.ts\n'; }
            if (args.join(' ') === 'diff --name-only') { return ''; }
            if (args.join(' ') === 'show -s --format=%P abc123') { return 'parent123\n'; }
            if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') { return 'main\n'; }
            return '';
        });

        await runtime.execute('fixupCommits', context, { commits: ['abc123'] });

        expect(calls.map((call) => call.args)).toEqual([
            ['diff', '--cached', '--name-only'],
            ['diff', '--name-only'],
            ['show', '-s', '--format=%P', 'abc123'],
            ['commit', '--fixup', 'abc123', '--no-edit'],
            ['rev-parse', '--abbrev-ref', 'HEAD'],
            ['rebase', '--autosquash', '--autostash', 'parent123', 'main'],
        ]);
        expect(calls.at(-1)?.env).toEqual({
            GIT_SEQUENCE_EDITOR: 'true',
            GIT_EDITOR: 'true',
        });
    });

    it('throws for unsupported semantic actions', async () => {
        const runtime = new CliGitRuntime(recordingProcess([]));

        await expect(runtime.execute('getBlame', context, {}, undefined)).rejects.toBeInstanceOf(UnsupportedGitOperationError);
    });

    it('forwards abort signals to the process boundary', async () => {
        const controller = new AbortController();
        let seenSignal: AbortSignal | undefined;
        const process: CliGitRuntimeProcess = async (_args, _context, options) => {
            seenSignal = options.signal;
            return '';
        };

        const runtime = new CliGitRuntime(process);
        await runtime.execute('stageAll', context, undefined, controller.signal);

        expect(seenSignal).toBe(controller.signal);
    });
});

function recordingProcess(calls: string[][]): CliGitRuntimeProcess {
    return async (args) => {
        calls.push([...args]);
        return '';
    };
}
