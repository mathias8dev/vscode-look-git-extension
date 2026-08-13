import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { CreateCommitPatchResultKind, type CreateCommitPatchUseCase } from '@application/usecases/commits/create-commit-patch';
import type { ExplainCommitDiffUseCase } from '@application/usecases/commits/explain-commit-diff';
import { runCommitCommand } from '@extension/commands/commit-commands';
import type { RuntimeCommandTargets } from '@extension/commands/runtime-command-targets';
import { resetMockVscode, setInputBoxValue, setWarningChoice } from '@tests/mocks/vscode';

const SELECTED_HASHES = ['newest', 'clicked', 'oldest'] as const;
const OLDEST_FIRST = ['oldest', 'clicked', 'newest'] as const;
const NEWEST_FIRST = ['newest', 'clicked', 'oldest'] as const;

describe('runCommitCommand multi-selection', () => {
    afterEach(() => { resetMockVscode(); });

    it('passes every selected commit to patch creation and diff explanation', async () => {
        const fixture = commandFixture();
        const createPatchExecute = vi.fn(async () => ({ kind: CreateCommitPatchResultKind.Cancelled }));
        const explainDiffExecute = vi.fn(async () => ({
            explanation: 'Summary',
            selectedCommits: SELECTED_HASHES.map((hash) => `commit: ${hash}`),
            diffTruncated: false,
        }));

        await execute(fixture, 'createPatch', {
            createCommitPatch: { execute: createPatchExecute } as unknown as CreateCommitPatchUseCase, // Partial use-case double only records the dispatcher input.
        });
        await execute(fixture, 'explainDiff', {
            explainCommitDiff: { execute: explainDiffExecute } as unknown as ExplainCommitDiffUseCase, // Partial use-case double only records the dispatcher input.
        });

        expect(createPatchExecute).toHaveBeenCalledWith(fixture.repository, SELECTED_HASHES);
        expect(explainDiffExecute).toHaveBeenCalledWith(fixture.repository, SELECTED_HASHES, expect.any(AbortSignal));
    });

    it('cherry-picks oldest first and reverts newest first across the selection', async () => {
        const fixture = commandFixture();

        await execute(fixture, 'cherryPick');
        await execute(fixture, 'revertCommit');

        expect(fixture.orderCommits).toHaveBeenNthCalledWith(1, SELECTED_HASHES, 'oldestFirst');
        expect(fixture.orderCommits).toHaveBeenNthCalledWith(2, SELECTED_HASHES, 'newestFirst');
        expect(fixture.cherryPick.mock.calls.map(([hash]) => hash)).toEqual(OLDEST_FIRST);
        expect(fixture.revertCommit.mock.calls.map(([hash]) => hash)).toEqual(NEWEST_FIRST);
    });

    it('squashes and drops the complete selection in topology order', async () => {
        const fixture = commandFixture();
        setInputBoxValue('Combined commit');
        setWarningChoice('Drop');

        await execute(fixture, 'squashInto');
        await execute(fixture, 'dropCommit');

        expect(fixture.squashCommits).toHaveBeenCalledWith(OLDEST_FIRST, 'Combined commit');
        expect(fixture.dropCommit.mock.calls.map(([hash]) => hash)).toEqual(NEWEST_FIRST);
    });
});

interface CommandFixture {
    readonly repository: GitRepository;
    readonly targets: RuntimeCommandTargets;
    readonly orderCommits: ReturnType<typeof vi.fn>;
    readonly cherryPick: ReturnType<typeof vi.fn>;
    readonly revertCommit: ReturnType<typeof vi.fn>;
    readonly squashCommits: ReturnType<typeof vi.fn>;
    readonly dropCommit: ReturnType<typeof vi.fn>;
}

function commandFixture(): CommandFixture {
    const orderCommits = vi.fn(async (_hashes: readonly string[], direction: 'newestFirst' | 'oldestFirst') =>
        direction === 'oldestFirst' ? OLDEST_FIRST : NEWEST_FIRST);
    const repository = {
        repoId: 'repo',
        cwd: '/repo',
        gitDir: '/repo/.git',
        kind: 'main',
        label: 'repo',
        orderCommits,
        getReachableCommitHashes: vi.fn(async () => new Set<string>()),
        getCommitDetails: vi.fn(async (hash: string) => ({
            hash,
            parentHashes: hash === 'newest' ? ['clicked'] : hash === 'clicked' ? ['oldest'] : [],
        })),
        getCommitMessage: vi.fn(async () => 'Original commit'),
    } as unknown as GitRepository; // Partial repository double implements only the multi-selection collaborators.
    const cherryPick = vi.fn(async () => {});
    const revertCommit = vi.fn(async () => {});
    const squashCommits = vi.fn(async () => {});
    const dropCommit = vi.fn(async () => {});
    const worktree = {
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' })),
        cherryPick,
        revertCommit,
        squashCommits,
        dropCommit,
    } as unknown as Worktree; // Partial worktree double implements only the multi-selection collaborators.

    return {
        repository,
        targets: { repository, worktree },
        orderCommits,
        cherryPick,
        revertCommit,
        squashCommits,
        dropCommit,
    };
}

interface ExecuteOptions {
    readonly createCommitPatch?: CreateCommitPatchUseCase;
    readonly explainCommitDiff?: ExplainCommitDiffUseCase;
}

async function execute(
    fixture: CommandFixture,
    command: Parameters<typeof runCommitCommand>[1],
    options: ExecuteOptions = {},
): Promise<boolean> {
    return runCommitCommand(
        fixture.repository,
        command,
        'clicked',
        SELECTED_HASHES,
        undefined,
        options.createCommitPatch,
        options.explainCommitDiff,
        undefined,
        undefined,
        undefined,
        undefined,
        fixture.targets,
    );
}
